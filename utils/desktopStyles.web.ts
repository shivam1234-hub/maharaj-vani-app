/**
 * Desktop chrome that React Native styles cannot express: slim scrollbars,
 * keyboard focus rings, the Windows UI font, text selection, and a couple of
 * keyframes. Injected once from index.js before expo-router mounts.
 *
 * Colours come from CSS variables that components/desktop/theme.tsx updates
 * whenever the light/dark mode changes.
 */
export function installDesktopStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('vv-desktop-css')) return;
  const style = document.createElement('style');
  style.id = 'vv-desktop-css';
  style.textContent = `
:root {
  --vv-scroll: rgba(140, 150, 190, 0.28);
  --vv-scroll-hover: rgba(140, 150, 190, 0.5);
  --vv-focus: #ff7722;
  --vv-select-bg: rgba(255, 119, 34, 0.3);
  color-scheme: dark;
}
html, body, #root { height: 100%; }
body {
  margin: 0;
  overflow: hidden;
  font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
* { font-family: inherit; }
::selection { background: var(--vv-select-bg); }

/* Slim, overlay-style scrollbars like modern Windows apps. */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--vv-scroll);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background: var(--vv-scroll-hover); background-clip: content-box; border: 2px solid transparent; }
::-webkit-scrollbar-corner { background: transparent; }

/* Focus rings for keyboard users only. */
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--vv-focus) !important; outline-offset: 2px; border-radius: 6px; }
input:focus-visible, textarea:focus-visible { outline: none !important; }
select:focus-visible { outline-offset: 0; }

input::placeholder { color: inherit; opacity: 0.55; }
input[type="search"]::-webkit-search-cancel-button { display: none; }

/* Native range input used for volume and seek. */
input[type="range"].vv-range {
  -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; margin: 0;
  height: 16px;
}
input[type="range"].vv-range::-webkit-slider-runnable-track {
  height: 4px; border-radius: 4px;
  background: linear-gradient(to right, var(--vv-range-fill, #ff7722) 0%, var(--vv-range-fill, #ff7722) var(--vv-range-pct, 0%), var(--vv-range-rest, rgba(140,150,190,.3)) var(--vv-range-pct, 0%), var(--vv-range-rest, rgba(140,150,190,.3)) 100%);
}
input[type="range"].vv-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%;
  background: #fff; margin-top: -4px; box-shadow: 0 1px 3px rgba(0,0,0,.4); opacity: 0; transition: opacity .12s;
}
input[type="range"].vv-range:hover::-webkit-slider-thumb,
input[type="range"].vv-range:focus-visible::-webkit-slider-thumb { opacity: 1; }
input[type="range"].vv-range:hover::-webkit-slider-runnable-track { height: 5px; }

select.vv-select {
  -webkit-appearance: none; appearance: none;
  font-size: 13px; padding: 7px 30px 7px 10px; border-radius: 8px; cursor: pointer;
  background-repeat: no-repeat; background-position: right 10px center; background-size: 10px;
}

@keyframes vv-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes vv-pop-in { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
@keyframes vv-eq { 0%, 100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
.vv-fade-in { animation: vv-fade-in .18s ease-out; }
.vv-pop-in { animation: vv-pop-in .14s ease-out; transform-origin: top left; }
.vv-eq-bar { animation: vv-eq .9s ease-in-out infinite; transform-origin: bottom; }
`;
  document.head.appendChild(style);
}
