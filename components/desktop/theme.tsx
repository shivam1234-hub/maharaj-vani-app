import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { C } from '../../constants/theme';
import { useMaharaj } from '../../contexts/MaharajContext';
import { desktop } from '../../utils/desktopBridge';

/**
 * Desktop theme. Dark is the app's own palette (constants/theme.ts, the one
 * the phone uses); light is a warm-paper variant built from the launcher
 * icon's cream (#FEF6DF), so both read as the same app. Follows Windows by
 * default, with a System / Light / Dark switch in the sidebar.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export interface DesktopTheme {
  dark: boolean;
  bg: string;
  sidebar: string;
  surface: string;
  surfaceHi: string;
  surfaceLo: string;
  hover: string;
  border: string;
  borderHi: string;
  text: string;
  textSub: string;
  textDim: string;
  textFaint: string;
  success: string;
  danger: string;
  youtube: string;
  /** Active speaker's colour. */
  accent: string;
  /** Accent darkened where needed for legible text on a light surface. */
  accentText: string;
  /** Darken/keep any accent for use as text on this theme. */
  ink: (color: string) => string;
  shadow: string;
}

const DARK = {
  dark: true,
  bg: C.bg,
  sidebar: '#0b0f1f',
  surface: C.surface,
  surfaceHi: C.surfaceHi,
  surfaceLo: C.surfaceLo,
  hover: '#ffffff0d',
  border: C.border,
  borderHi: C.borderHi,
  text: C.text,
  textSub: C.textSub,
  textDim: C.textDim,
  textFaint: '#5a6290',
  success: C.success,
  danger: C.danger,
  youtube: C.youtube,
  shadow: '0 10px 30px rgba(0,0,0,.45)',
};

const LIGHT = {
  dark: false,
  bg: '#f7f5f0',
  sidebar: '#efebe2',
  surface: '#ffffff',
  surfaceHi: '#f2efe8',
  surfaceLo: '#faf8f4',
  hover: '#0000000a',
  border: '#e6e0d4',
  borderHi: '#d5cdbd',
  text: '#1c1a24',
  textSub: '#45424f',
  textDim: '#6f6b7c',
  textFaint: '#9c98a8',
  success: '#1f9d55',
  danger: '#d23c41',
  youtube: '#e0251b',
  shadow: '0 10px 30px rgba(40,30,10,.14)',
};

/** Multiply RGB towards black until the colour reads on white. */
function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Text colour for a light theme: darken bright accents (yellows, teals) until ~4.5:1 on white. */
function inkOnLight(color: string): string {
  let c = color;
  for (let i = 0; i < 6 && (1.05 / (luminance(c) + 0.05)) < 4.2; i++) c = darken(c, 0.12);
  return c;
}

interface ThemeCtx {
  theme: DesktopTheme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const MODE_KEY = 'vv_desktop_theme_v1';

function systemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function DesktopThemeProvider({ children }: { children: React.ReactNode }) {
  const { maharaj } = useMaharaj();
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const v = window.localStorage.getItem(MODE_KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch {}
    return 'system';
  });
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Keep the native title bar and menus in step with the page. Only an
  // explicit choice is pushed: 'system' must stay 'system' or the media
  // query above would stop following Windows.
  useEffect(() => {
    desktop()?.setTheme(mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { window.localStorage.setItem(MODE_KEY, m); } catch {}
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && sysDark);
  const theme = useMemo<DesktopTheme>(() => {
    const base = dark ? DARK : LIGHT;
    const ink = (c: string) => (dark ? c : inkOnLight(c));
    return { ...base, accent: maharaj.accent, accentText: ink(maharaj.accent), ink };
  }, [dark, maharaj.accent]);

  // Feed the global stylesheet (scrollbars, focus ring, selection).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style;
    root.setProperty('--vv-focus', theme.accent);
    root.setProperty('--vv-select-bg', `${theme.accent}55`);
    root.setProperty('--vv-scroll', dark ? 'rgba(140,150,190,.28)' : 'rgba(90,80,60,.25)');
    root.setProperty('--vv-scroll-hover', dark ? 'rgba(140,150,190,.5)' : 'rgba(90,80,60,.45)');
    root.setProperty('color-scheme', dark ? 'dark' : 'light');
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
  }, [theme, dark]);

  const value = useMemo(() => ({ theme, mode, setMode }), [theme, mode, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): DesktopTheme {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme outside DesktopThemeProvider');
  return c.theme;
}

export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const c = useContext(Ctx);
  if (!c) throw new Error('useThemeMode outside DesktopThemeProvider');
  return [c.mode, c.setMode];
}

/** Build a style object once per theme. */
export function useStyles<T>(factory: (t: DesktopTheme) => T): T {
  const t = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(t), [t]);
}

/** `#rrggbb` + alpha → `#rrggbbaa`. */
export const a = (hex: string, alpha: number) =>
  `${hex.slice(0, 7)}${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}`;
