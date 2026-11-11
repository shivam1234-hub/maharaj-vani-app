# Vaishnava Vani — Windows desktop build

An Electron shell over the Expo **web** export of this app. The desktop UI is
not a stretched phone screen: every route has a `*.web.tsx` variant built from
`components/desktop/` (sidebar, top bar with global search, Spotify-style
now-playing bar, tables, grids and a three-pane Verses reader). The phone
screens (`*.tsx`) are untouched and still ship on Android/iOS.

## Run / build

```cmd
npm install            (project root — the export uses the root's Metro)
cd desktop
npm install
npm run dev            export the web bundle and open the app
npm start              reopen without re-exporting
npm run dist           NSIS installer + portable .exe (x64) in desktop/release/
```

`npm run desktop` in the project root does the same as `npm run dev` here.

| Output | What it is |
| --- | --- |
| `VaishnavaVani-Setup-<version>.exe` | Per-user installer with Start-menu/desktop shortcuts and an uninstaller |
| `VaishnavaVani-<version>-portable.exe` | Single file, no install |

Both are unsigned: SmartScreen shows "Windows protected your PC" the first
time — *More info → Run anyway*.

## How it differs from the phone

| Concern | Phone | Windows |
| --- | --- | --- |
| Playback | react-native-track-player | `<audio>` + Media Session (`contexts/AudioContext.web.tsx`) — media keys and the Windows media overlay |
| Lock-screen / notification controls | Media notification | Windows media overlay; Playback menu with Ctrl shortcuts |
| Downloads | expo-file-system | `desktop/lib/downloads.js` in the main process, mirrored by `contexts/DownloadContext.web.tsx`; files in `%APPDATA%\Vaishnava Vani\audio\<id>.mp3` (File → Open Downloads Folder) |
| YouTube search | fetch from the app | `desktop/lib/net.js` over IPC (`utils/httpFetch.web.ts`) — YouTube sends no CORS headers |
| YouTube player | WebView wrapper page | `<iframe>` on the app's `http://127.0.0.1` origin (`app/video/[id].web.tsx`) |
| Picture-in-picture | Android PiP | **Pop out**: small frameless always-on-top window (`openVideoPopout` in `main.js`) |
| Video notification | expo-notifications transport | not needed (`utils/videoNotification.web.ts` no-ops); "Keep playing in background" = keep playing when minimised |
| Download finished | — | Windows toast when the window is in the background |
| Alert.alert | native | Windows message box (`utils/webAlert.web.ts`; react-native-web's Alert is a no-op) |

## Startup safety

The window is shown on first paint, or after 4 s regardless, and also on a
failed load or a crashed renderer — so a startup problem can never leave an
invisible process holding the single-instance lock (which would make every
later launch silently do nothing). Startup steps and errors are logged to
`%APPDATA%\Vaishnava Vani\startup.log`, and a fatal error is shown in a
message box with that path.

## Keyboard

Space play/pause · ←/→ ±15 s · Shift+←/→ speed · Ctrl+0 normal speed ·
Ctrl+Shift+↑/↓ previous/next in queue · Ctrl+K / Ctrl+F search everything ·
Ctrl+1…6 sections · Ctrl+L open the playing lecture · Alt+← / Backspace / mouse
back button: back · Esc closes menus · `?` shows the list.

Bare keys are bound in the page (guarded on focus), not as menu accelerators,
so they never steal typing in a search box.

## Development helpers

- `node scripts/shots.js <plan.json>` — runs the unpackaged app through a
  screenshot plan (see `runShots` in `main.js`). Development only.
- `VV_INSECURE_TLS=1` — dev only (ignored when packaged): accepts a TLS-
  inspecting office proxy and turns off Chromium's post-quantum key share,
  which such proxies drop. Never needed on a normal network.
- `npm run icons` — regenerates `build/icon.{png,ico}` and
  `assets/desktop-logo.png` from the Android launcher icon.
