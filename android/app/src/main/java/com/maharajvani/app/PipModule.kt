package com.maharajvani.app

import android.app.AppOpsManager
import android.app.PendingIntent
import android.content.Context
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Promise
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Intent
import android.graphics.drawable.Icon
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Picture-in-Picture support for the YouTube screen.
 *
 * Why this exists: the YouTube embed pauses itself the moment its page is
 * hidden — its own script hooks the Page Visibility API, which is how YouTube
 * reserves background playback for Premium — and it lives in a cross-origin
 * iframe, so nothing can be overridden from our side.
 *
 * PiP sidesteps that honestly rather than defeating it: in PiP the activity is
 * still VISIBLE, just small, so the page never becomes hidden and the player
 * never pauses. The lecture keeps playing because it genuinely is still on
 * screen.
 *
 * The window's play/pause button is OURS and has to be supplied explicitly:
 * a PiP window shows only the actions given to it through
 * [PictureInPictureParams.Builder.setActions]. Entering PiP without any (as
 * this first did) leaves the system's generic transport buttons on screen
 * wired to nothing, so tapping them appears to do nothing at all.
 */
class PipModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    // Kept so the activity can reach JS from lifecycle callbacks and the
    // action receiver, neither of which has a module instance.
    contextRef = reactContext
  }

  override fun getName() = NAME

  /**
   * Arms PiP. Read by [MainActivity.onUserLeaveHint]; without this gate,
   * leaving ANY screen would shrink the whole app into a floating window.
   * Set only while the video screen is up.
   */
  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    armed = enabled
  }

  /**
   * Enter PiP immediately, for an explicit button rather than Home. Resolves
   * whether the system actually entered it, so the UI can explain a refusal
   * (most often PiP switched off for this app in system settings) instead of
   * the button appearing to do nothing.
   */
  @ReactMethod
  fun enterPip(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    activity.runOnUiThread { promise.resolve(enterPipOn(activity)) }
  }

  /**
   * False when the user (or the phone maker's default) has switched
   * "Picture-in-picture" off for this app. Many Android skins common in India
   * ship it off, and entering PiP then fails silently.
   */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isAllowed(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return try {
      val ctx = reactApplicationContext
      val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val uid = android.os.Process.myUid()
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE, uid, ctx.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE, uid, ctx.packageName)
      }
      mode == AppOpsManager.MODE_ALLOWED
    } catch (e: Throwable) {
      true // Can't tell; don't nag.
    }
  }

  /** Opens this app's picture-in-picture switch, or its App info page as a fallback. */
  @ReactMethod
  fun openSettings() {
    val ctx = reactApplicationContext
    val pkg = Uri.parse("package:" + ctx.packageName)
    val attempts = listOf(
      Intent("android.settings.PICTURE_IN_PICTURE_SETTINGS", pkg),
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg),
    )
    for (intent in attempts) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
        return
      } catch (e: Throwable) {
      }
    }
  }

  /**
   * Keeps the floating window's button in step with the player. Called by JS
   * whenever playback starts or stops, so the icon shows pause while playing
   * and play while paused.
   */
  @ReactMethod
  fun setPlaying(isPlaying: Boolean) {
    playing = isPlaying
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { updateActions(activity) }
  }

  /** Whether the device supports PiP at all, so the UI can hide the button. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isSupported(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val activity = reactApplicationContext.currentActivity ?: return false
    return activity.packageManager
      .hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)
  }

  companion object {
    const val NAME = "PipModule"

    /** Broadcast sent by the floating window's button; handled in MainActivity. */
    const val ACTION_CONTROL = "com.maharajvani.app.PIP_CONTROL"
    const val EXTRA_CONTROL = "control"
    const val CONTROL_TOGGLE = "toggle"

    @Volatile
    @JvmStatic
    var armed: Boolean = false

    @Volatile
    private var playing: Boolean = true

    @Volatile
    private var contextRef: ReactApplicationContext? = null

    /**
     * Tells JS that PiP was entered or left.
     *
     * Deriving this from window dimensions instead does NOT work: RN does not
     * re-report `useWindowDimensions` for the PiP resize, so the layout kept
     * rendering the navigation header inside a 128dp-tall window.
     */
    @JvmStatic
    fun emitPipChanged(isInPip: Boolean, widthDp: Int, heightDp: Int) {
      val ctx = contextRef ?: return
      try {
        // The size matters as much as the flag. React Native keeps reporting
        // full-screen dimensions in PiP, so a layout sized from
        // useWindowDimensions fills a 1080x2400 canvas while the real window
        // is ~228x128dp — the window then shows only the top-left corner of
        // it, which is the player's black letterbox bar and looks exactly
        // like a video that failed to load.
        val map = Arguments.createMap()
        map.putBoolean("inPip", isInPip)
        map.putInt("width", widthDp)
        map.putInt("height", heightDp)
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("pipModeChanged", map)
      } catch (e: Throwable) {
        // JS may be gone during teardown; nothing useful to do.
      }
    }

    /** Forwards a tap on the window's button to JS, which drives the player. */
    @JvmStatic
    fun emitPipAction(control: String) {
      val ctx = contextRef ?: return
      try {
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("pipAction", control)
      } catch (e: Throwable) {
      }
    }



    /**
     * Play command for the embedded player, issued natively.
     *
     * Cannot be sent through React Native: RN defers view commands while the
     * activity is paused (PiP), so the command would sit queued until the
     * app came back to the foreground.
     *
     * id/channel must match the page's `listening` handshake or the player
     * ignores the command outright.
     */
    private const val PAUSE_JS =
      "(function(){try{var f=document.querySelector('iframe');" +
        "if(f&&f.contentWindow){f.contentWindow.postMessage(JSON.stringify(" +
        "{event:'command',func:'pauseVideo',args:[],id:1,channel:'widget'}),'*');}" +
        "}catch(e){}})();"

    private const val PLAY_JS =
      "(function(){try{var f=document.querySelector('iframe');" +
        "if(f&&f.contentWindow){f.contentWindow.postMessage(JSON.stringify(" +
        "{event:'command',func:'playVideo',args:[],id:1,channel:'widget'}),'*');}" +
        "}catch(e){}})();"

    /**
     * Pause or resume playback from native code.
     *
     * The command must be issued here rather than from JS: React Native defers
     * view commands while the activity is paused, and a PiP activity IS
     * paused, so an injected pause sat queued until you tapped back into the
     * app — the original "it only stops once I go inside" symptom. A direct
     * evaluateJavascript runs immediately regardless of the activity state.
     */
    @JvmStatic
    fun setMediaPaused(activity: android.app.Activity, paused: Boolean) {
      activity.runOnUiThread {
        try {
          val root = activity.window?.decorView as? ViewGroup ?: return@runOnUiThread
          forEachWebView(root) { web ->
            if (paused) {
              // onPause() is what actually stops the media here. A pause
              // COMMAND alone does nothing: while the activity is paused the
              // WebView defers JS execution, so the command is never run.
              //
              // Deliberately NOT pauseTimers(): that suspends layout, parsing
              // and JS timers for every WebView in the process, which threw
              // away the player's buffer and made playback re-load from
              // scratch on resume. onPause() alone stops playback without
              // gutting the player.
              web.onPause()
            } else {
              // Waking the WebView re-enables JS, so the play command that
              // follows can actually run.
              web.onResume()
              web.evaluateJavascript(PLAY_JS, null)
            }
          }
        } catch (e: Throwable) {
        }
      }
    }

    private fun forEachWebView(view: View, action: (WebView) -> Unit) {
      if (view is WebView) {
        action(view)
        return
      }
      if (view is ViewGroup) {
        for (i in 0 until view.childCount) forEachWebView(view.getChildAt(i), action)
      }
    }

    /** Current play state, so the receiver knows which way to toggle. */
    @JvmStatic
    fun isPlaying(): Boolean = playing

    @JvmStatic
    fun setPlayingState(value: Boolean) {
      playing = value
    }

    /**
     * A single play/pause toggle. One button rather than separate play and
     * pause entries, so the window never shows an action that does nothing in
     * the current state.
     */
    private fun buildParams(activity: android.app.Activity): PictureInPictureParams {
      val builder = PictureInPictureParams.Builder()
        // The player is 16:9, so the floating window matches it and the video
        // is not letterboxed inside its own window.
        .setAspectRatio(Rational(16, 9))

      val intent = Intent(ACTION_CONTROL)
        .setPackage(activity.packageName)
        .putExtra(EXTRA_CONTROL, CONTROL_TOGGLE)

      // FLAG_IMMUTABLE is mandatory from API 31; without it the PendingIntent
      // is rejected outright and the action never appears.
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }

      val pending = PendingIntent.getBroadcast(activity, 1, intent, flags)

      val icon = Icon.createWithResource(
        activity,
        if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
      )
      val label = if (playing) "Pause" else "Play"

      builder.setActions(listOf(RemoteAction(icon, label, label, pending)))
      return builder.build()
    }

    /** Refresh the window's button without leaving PiP. */
    @JvmStatic
    fun updateActions(activity: android.app.Activity) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      try {
        activity.setPictureInPictureParams(buildParams(activity))
      } catch (e: Throwable) {
      }
    }

    /**
     * Shared by the explicit call and by onUserLeaveHint. Failures are
     * swallowed: PiP is refused on some OEM builds and in multi-window, and a
     * crash on the way out of the app would be far worse than no PiP.
     */
    @JvmStatic
    fun enterPipOn(activity: android.app.Activity): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
      return try {
        activity.enterPictureInPictureMode(buildParams(activity))
      } catch (e: Throwable) {
        // Ignored on purpose — see above. Reported as false so the button can
        // say why nothing happened.
        false
      }
    }
  }
}
