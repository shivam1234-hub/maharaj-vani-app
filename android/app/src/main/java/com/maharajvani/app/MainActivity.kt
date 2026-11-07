package com.maharajvani.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  /**
   * Receives taps on the PiP window's play/pause button and hands them to JS,
   * which drives the WebView player. The button's PendingIntent broadcasts
   * rather than starting an activity, so tapping it does not pull the app back
   * to the foreground.
   */
  private val pipControlReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val control = intent?.getStringExtra(PipModule.EXTRA_CONTROL) ?: return
      if (control != PipModule.CONTROL_TOGGLE) return

      // Act natively rather than asking JS to inject into the WebView. In PiP
      // the activity is PAUSED, so injected JS is deferred until you tap back
      // into the app — which made the button look dead, then apply late.
      val next = !PipModule.isPlaying()
      PipModule.setPlayingState(next)
      PipModule.setMediaPaused(this@MainActivity, !next)
      PipModule.updateActions(this@MainActivity)

      // JS still hears about it, but only to keep its own button in step.
      PipModule.emitPipAction(control)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)

    val filter = IntentFilter(PipModule.ACTION_CONTROL)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Required from API 33: an unexported receiver must say so explicitly,
      // otherwise registration throws and the button silently does nothing.
      registerReceiver(pipControlReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(pipControlReceiver, filter)
    }
  }

  override fun onDestroy() {
    try {
      unregisterReceiver(pipControlReceiver)
    } catch (e: Throwable) {
      // Already unregistered; not worth crashing a teardown over.
    }
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }


  /**
   * Fired when the user leaves by pressing Home (but NOT on Back, and not when
   * another app merely takes focus). Entering PiP here is what keeps a playing
   * lecture alive: in PiP the activity stays visible, so the YouTube page never
   * goes hidden and its own visibility-pause never fires.
   *
   * Gated on [PipModule.armed] so this only happens while the video screen is
   * up — otherwise leaving any screen would shrink the whole app.
   */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (PipModule.armed) {
      PipModule.enterPipOn(this)
    }
  }


  /** Forwarded to JS so the video screen can drop its chrome in the small window. */
  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    PipModule.emitPipChanged(
      isInPictureInPictureMode,
      newConfig.screenWidthDp,
      newConfig.screenHeightDp,
    )
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
