/**
 * The desktop window frame (web/Electron only): left sidebar with the speaker
 * switcher and navigation, a top bar with back/forward and global search, the
 * routed content, and a persistent now-playing bar along the bottom.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Image, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaharajAvatar from '../MaharajAvatar';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { MAHARAJAS, MAHARAJ_ORDER, honoured, respectful } from '../../data/maharajas';
import { getCatalog } from '../../hooks/useLectures';
import { desktop } from '../../utils/desktopBridge';
import { a, useTheme, useThemeMode, type ThemeMode } from './theme';
import { Hover, IconButton, SearchField, Tip, useAnchor, useMenu, type IconName } from './kit';
import NowPlayingBar from './NowPlayingBar';

// ------------------------------------------------------------------ search context

interface SearchCtx {
  query: string;
  setQuery: (q: string) => void;
  focusSearch: () => void;
}
const SearchContext = createContext<SearchCtx | null>(null);

export function useDesktopSearch(): SearchCtx {
  const c = useContext(SearchContext);
  if (!c) throw new Error('useDesktopSearch outside Shell');
  return c;
}

// ------------------------------------------------------------------ navigation

interface NavItem { href: string; label: string; icon: IconName; iconOn: IconName; match: (p: string) => boolean }

const NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: 'grid-outline', iconOn: 'grid', match: (p) => p === '/' },
  { href: '/browse', label: 'Browse', icon: 'library-outline', iconOn: 'library', match: (p) => p.startsWith('/browse') || p.startsWith('/category') },
  { href: '/verses', label: 'Verses', icon: 'book-outline', iconOn: 'book', match: (p) => p.startsWith('/verses') || p.startsWith('/shastra') },
  { href: '/youtube', label: 'YouTube', icon: 'logo-youtube', iconOn: 'logo-youtube', match: (p) => p.startsWith('/youtube') || p.startsWith('/video') },
  { href: '/downloads', label: 'Downloads', icon: 'cloud-download-outline', iconOn: 'cloud-download', match: (p) => p.startsWith('/downloads') },
  { href: '/history', label: 'History', icon: 'time-outline', iconOn: 'time', match: (p) => p.startsWith('/history') },
];

function go(href: string) {
  router.navigate(href as any);
}

export function goBack() {
  if (router.canGoBack()) router.back();
}

// ------------------------------------------------------------------ shell

export default function Shell({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const collapsed = width < 1200;
  const [query, setQueryState] = useState('');
  const inputRef = useRef<TextInput>(null);
  const pathname = usePathname();
  const [showKeys, setShowKeys] = useState(false);

  const focusSearch = useCallback(() => {
    inputRef.current?.focus();
    // Select what's there so typing replaces it, like any desktop search box.
    const el = inputRef.current as any;
    if (el && typeof el.select === 'function') el.select();
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    if (q.trim() && !window.location.pathname.startsWith('/global-search')) {
      router.push('/global-search');
    }
  }, []);

  // Menu commands and navigation requests from the Electron shell.
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    const offCmd = d.onCommand((cmd) => {
      if (cmd === 'focusSearch') focusSearch();
      else if (cmd === 'back') goBack();
      else if (cmd === 'shortcuts') setShowKeys(true);
    });
    const offNav = d.onNavigate((route) => {
      if (typeof route === 'string' && route.startsWith('/')) go(route);
    });
    return () => { offCmd(); offNav(); };
  }, [focusSearch]);

  // Global keyboard: Ctrl+K / Ctrl+F search, Alt+← / Backspace back, ? help.
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'f')) {
        e.preventDefault();
        focusSearch();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (typeof window !== 'undefined') window.history.forward();
      } else if (e.key === 'Backspace' && !typing() && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        goBack();
      } else if (e.key === 'Escape' && typing()) {
        (document.activeElement as HTMLElement).blur();
      } else if (e.key === '?' && !typing()) {
        setShowKeys((v) => !v);
      } else if (e.key === 'Escape') {
        setShowKeys(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusSearch]);

  // Mouse back/forward buttons.
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); goBack(); }
      if (e.button === 4) { e.preventDefault(); window.history.forward(); }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  // Used by desktop/main.js's screenshot automation in development builds.
  useEffect(() => {
    (window as any).__vvNavigate = (route: string) => router.navigate(route as any);
    (window as any).__vvPush = (route: string) => router.push(route as any);
    (window as any).__vvSetQuery = (q: string) => setQuery(q);
  }, [setQuery]);

  // The top-bar query belongs to "Search everything"; leaving it clears the box.
  useEffect(() => {
    if (!pathname.startsWith('/global-search')) setQueryState('');
  }, [pathname]);

  const searchValue = useMemo<SearchCtx>(() => ({ query, setQuery, focusSearch }), [query, setQuery, focusSearch]);

  return (
    <SearchContext.Provider value={searchValue}>
      <View style={{ flex: 1, backgroundColor: t.bg, height: '100%' as any }}>
        <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
          <Sidebar collapsed={collapsed} pathname={pathname} />
          <View style={{ flex: 1, minWidth: 0, backgroundColor: t.bg }}>
            <TopBar inputRef={inputRef} query={query} setQuery={setQuery} pathname={pathname} onHelp={() => setShowKeys(true)} />
            <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
          </View>
        </View>
        <NowPlayingBar />
        {showKeys ? <ShortcutsOverlay onClose={() => setShowKeys(false)} /> : null}
      </View>
    </SearchContext.Provider>
  );
}

// ------------------------------------------------------------------ sidebar

function Sidebar({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const t = useTheme();
  const { progress } = useDownload();
  const { favourites } = useLibrary();
  const activeDownloads = Object.values(progress).filter((p) => p.status !== 'error').length;
  const w = collapsed ? 76 : 256;

  return (
    <View
      style={{
        width: w,
        backgroundColor: t.sidebar,
        borderRightWidth: 1,
        borderRightColor: t.border,
        transitionDuration: '160ms',
        transitionProperty: 'width',
      } as any}
    >
      {/* brand */}
      <Hover
        onPress={() => go('/')}
        accessibilityLabel="Vaishnava Vani — Home"
        style={() => ({
          flexDirection: 'row', alignItems: 'center', gap: 11, height: 64,
          paddingHorizontal: collapsed ? 0 : 18, justifyContent: collapsed ? 'center' : 'flex-start',
        })}
      >
        <Image source={require('../../assets/desktop-logo.png')} style={{ width: 36, height: 36, borderRadius: 9 }} />
        {!collapsed && (
          <View>
            <Text style={{ color: t.text, fontSize: 16.5, fontWeight: '800', letterSpacing: 0.2 }}>Vaishnava Vani</Text>
            <Text style={{ color: t.textDim, fontSize: 11, fontWeight: '600', marginTop: 1 }}>Hare Krishna</Text>
          </View>
        )}
      </Hover>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <SpeakerSwitcher collapsed={collapsed} />

        <View style={{ marginTop: 14, paddingHorizontal: collapsed ? 10 : 12, gap: 2 }}>
          {!collapsed && <SideLabel text="Library" />}
          {NAV.map((n) => (
            <NavRow
              key={n.href}
              item={n}
              on={n.match(pathname)}
              collapsed={collapsed}
              badge={n.href === '/downloads' && activeDownloads > 0 ? activeDownloads : undefined}
            />
          ))}
          {!collapsed && <SideLabel text="Discover" style={{ marginTop: 14 }} />}
          {collapsed && <View style={{ height: 1, backgroundColor: t.border, marginVertical: 8, marginHorizontal: 8 }} />}
          <NavRow
            item={{ href: '/global-search', label: 'Search everything', icon: 'planet-outline', iconOn: 'planet', match: (p) => p.startsWith('/global-search') }}
            on={pathname.startsWith('/global-search')}
            collapsed={collapsed}
          />
          <NavRow
            item={{ href: '/browse?favourites=1', label: 'Favourites', icon: 'heart-outline', iconOn: 'heart', match: () => false }}
            on={false}
            collapsed={collapsed}
            badge={favourites.size > 0 ? favourites.size : undefined}
            badgeMuted
          />
        </View>
      </ScrollView>

      <SidebarFooter collapsed={collapsed} />
    </View>
  );
}

function SideLabel({ text, style }: { text: string; style?: any }) {
  const t = useTheme();
  return (
    <Text style={[{ color: t.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 6, marginTop: 4 }, style]}>
      {text}
    </Text>
  );
}

function NavRow({
  item, on, collapsed, badge, badgeMuted,
}: { item: NavItem; on: boolean; collapsed: boolean; badge?: number; badgeMuted?: boolean }) {
  const t = useTheme();
  const row = (
    <Hover
      onPress={() => go(item.href)}
      accessibilityLabel={item.label}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: 40,
        borderRadius: 10,
        paddingHorizontal: collapsed ? 0 : 12,
        justifyContent: collapsed ? 'center' : 'flex-start',
        backgroundColor: on ? a(t.accent, t.dark ? 0.16 : 0.13) : hovered ? t.hover : 'transparent',
        transitionDuration: '120ms',
      } as any)}
    >
      {on && !collapsed ? (
        <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: t.accent }} />
      ) : null}
      <Ionicons name={on ? item.iconOn : item.icon} size={19} color={on ? t.accentText : t.textSub} />
      {!collapsed && (
        <Text style={{ flex: 1, color: on ? t.text : t.textSub, fontSize: 13.5, fontWeight: on ? '700' : '600' }} numberOfLines={1}>
          {item.label}
        </Text>
      )}
      {badge != null ? (
        <View
          style={{
            position: collapsed ? 'absolute' : 'relative', top: collapsed ? 4 : undefined, right: collapsed ? 10 : undefined,
            minWidth: 20, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
            backgroundColor: badgeMuted ? t.surfaceHi : t.accent,
          } as any}
        >
          <Text style={{ color: badgeMuted ? t.textDim : '#fff', fontSize: 10.5, fontWeight: '800' }}>{badge}</Text>
        </View>
      ) : null}
    </Hover>
  );
  return collapsed ? <Tip label={item.label}>{row}</Tip> : row;
}

/**
 * The speaker switch — on the phone a strip across Home/Search/Video; here a
 * permanent card at the top of the sidebar plus one-click avatars for all
 * nine. The choice is persisted by MaharajContext and tints the whole app.
 */
function SpeakerSwitcher({ collapsed }: { collapsed: boolean }) {
  const t = useTheme();
  const { maharaj, active, setActive } = useMaharaj();
  const { open } = useMenu();
  const { ref, at } = useAnchor();
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of MAHARAJ_ORDER) {
      try { out[k] = getCatalog(k).length; } catch { out[k] = 0; }
    }
    return out;
  }, []);

  const openList = () => {
    const p = at();
    open(collapsed ? p.x + 60 : p.x, collapsed ? (p.top ?? p.y) : p.y, MAHARAJ_ORDER.map((k) => ({
      label: honoured(MAHARAJAS[k].short),
      left: <MaharajAvatar maharaj={MAHARAJAS[k]} size={22} active={k === active} />,
      hint: counts[k].toLocaleString(),
      checked: k === active,
      onPress: () => setActive(k),
    })), 300);
  };

  if (collapsed) {
    return (
      <div ref={ref} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
        <Tip label={`${honoured(maharaj.short)} — change speaker`}>
          <Hover onPress={openList} accessibilityLabel="Change speaker" style={() => ({ borderRadius: 30 })}>
            <MaharajAvatar maharaj={maharaj} size={40} />
          </Hover>
        </Tip>
      </div>
    );
  }

  return (
    <View style={{ paddingHorizontal: 12 }}>
      <SideLabel text="Speaker" />
      <div ref={ref}>
        <Hover
          onPress={openList}
          accessibilityLabel="Change speaker"
          style={({ hovered }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 14,
            borderWidth: 1, borderColor: a(t.accent, hovered ? 0.6 : 0.35),
            backgroundColor: a(t.accent, t.dark ? 0.1 : 0.08),
            transitionDuration: '120ms',
          } as any)}
        >
          <MaharajAvatar maharaj={maharaj} size={42} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: t.textDim, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 }}>{maharaj.honorific}</Text>
            <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '800', lineHeight: 17 }} numberOfLines={2}>
              {respectful(maharaj.short)}
            </Text>
            <Text style={{ color: t.accentText, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
              {counts[active].toLocaleString()} recordings
            </Text>
          </View>
          <Ionicons name="chevron-expand" size={16} color={t.textDim} />
        </Hover>
      </div>
      {/* One click to any speaker: sannyasis on the first row, Prabhujis on the second. */}
      {[MAHARAJ_ORDER.filter((k) => MAHARAJAS[k].honorific === 'His Holiness'), MAHARAJ_ORDER.filter((k) => MAHARAJAS[k].honorific !== 'His Holiness')].map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 6, marginTop: ri ? 6 : 10, justifyContent: 'center' }}>
          {row.map((k) => {
            const m = MAHARAJAS[k];
            const on = k === active;
            return (
              <Tip key={k} label={honoured(m.short)}>
                <Hover
                  onPress={() => setActive(k)}
                  accessibilityLabel={m.name}
                  style={({ hovered }) => ({
                    borderRadius: 20, opacity: on || hovered ? 1 : 0.6,
                    transform: [{ scale: hovered && !on ? 1.08 : 1 }], transitionDuration: '120ms',
                  } as any)}
                >
                  <MaharajAvatar maharaj={m} size={26} active={on} />
                </Hover>
              </Tip>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const t = useTheme();
  const [mode, setMode] = useThemeMode();
  const modes: Array<{ m: ThemeMode; icon: IconName; label: string }> = [
    { m: 'system', icon: 'desktop-outline', label: 'Follow Windows' },
    { m: 'light', icon: 'sunny-outline', label: 'Light' },
    { m: 'dark', icon: 'moon-outline', label: 'Dark' },
  ];
  if (collapsed) {
    const i = modes.findIndex((x) => x.m === mode);
    const next = modes[(i + 1) % modes.length];
    return (
      <View style={{ alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.border }}>
        <IconButton icon={modes[i].icon} label={`Theme: ${modes[i].label} (click for ${next.label})`} onPress={() => setMode(next.m)} />
      </View>
    );
  }
  return (
    <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: t.border, gap: 10 }}>
      <View style={{ flexDirection: 'row', backgroundColor: t.surfaceHi, borderRadius: 9, padding: 3 }}>
        {modes.map((x) => {
          const on = x.m === mode;
          return (
            <Tip key={x.m} label={x.label}>
              <Hover
                onPress={() => setMode(x.m)}
                accessibilityLabel={`Theme: ${x.label}`}
                style={({ hovered }) => ({
                  flex: 1, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? t.surface : hovered ? t.hover : 'transparent',
                  borderWidth: on ? 1 : 0, borderColor: t.border,
                } as any)}
              >
                <Ionicons name={x.icon} size={15} color={on ? t.text : t.textDim} />
              </Hover>
            </Tip>
          );
        })}
      </View>
      <Text style={{ color: t.textFaint, fontSize: 10.5, lineHeight: 14 }}>
        Version {desktop()?.version ?? '1.9.2'} · Audio courtesy of audio.iskcondesiretree.com
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ top bar

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Home'],
  [/^\/browse/, 'Browse'],
  [/^\/category\//, 'Browse · Category'],
  [/^\/verses|^\/shastra/, 'Verse by verse'],
  [/^\/youtube/, 'YouTube'],
  [/^\/video\//, 'Watch'],
  [/^\/downloads/, 'Downloads'],
  [/^\/history/, 'History'],
  [/^\/lecture\//, 'Lecture'],
  [/^\/global-search/, 'Search everything'],
];

function TopBar({
  inputRef, query, setQuery, pathname, onHelp,
}: {
  inputRef: React.RefObject<TextInput | null>;
  query: string;
  setQuery: (q: string) => void;
  pathname: string;
  onHelp: () => void;
}) {
  const t = useTheme();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? '';
  const canBack = router.canGoBack();
  return (
    <View
      style={{
        height: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.bg,
      }}
    >
      <IconButton icon="chevron-back" label="Back (Alt+←)" onPress={goBack} disabled={!canBack} />
      <IconButton icon="chevron-forward" label="Forward (Alt+→)" onPress={() => window.history.forward()} />
      <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', marginLeft: 6, width: 170 }} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <SearchField
          inputRef={inputRef}
          value={query}
          onChange={setQuery}
          placeholder="Search all speakers — lectures, verses, places, YouTube…"
          hint="Ctrl+K"
          onSubmit={() => router.push('/global-search')}
          style={{ width: '100%', maxWidth: 620 } as any}
        />
      </View>
      <View style={{ width: 170, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
        <IconButton icon="keypad-outline" label="Keyboard shortcuts (?)" onPress={onHelp} />
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ shortcuts

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['← / →', 'Back / forward 15 seconds'],
  ['Shift + ← / →', 'Slower / faster'],
  ['Ctrl + 0', 'Normal speed'],
  ['Ctrl + Shift + ↑ / ↓', 'Previous / next lecture in queue'],
  ['Ctrl + K  or  Ctrl + F', 'Search everything'],
  ['Ctrl + 1 … 6', 'Home, Browse, Verses, YouTube, Downloads, History'],
  ['Ctrl + L', 'Open the lecture that is playing'],
  ['Alt + ←  /  Backspace', 'Back'],
  ['Esc', 'Close menus, leave the search box'],
  ['Ctrl + +  /  Ctrl + −', 'Zoom in / out'],
];

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}
    >
      <div
        className="vv-pop-in"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 520, background: t.surface, border: `1px solid ${t.borderHi}`, borderRadius: 16, boxShadow: t.shadow, padding: 24 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ flex: 1, color: t.text, fontSize: 18, fontWeight: '800' }}>Keyboard shortcuts</Text>
          <IconButton icon="close" label="Close (Esc)" onPress={onClose} />
        </View>
        {SHORTCUTS.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: t.border }}>
            <Text style={{ flex: 1, color: t.textSub, fontSize: 13 }}>{v}</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: t.surfaceHi, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>{k}</Text>
            </View>
          </View>
        ))}
      </div>
    </div>
  );
}
