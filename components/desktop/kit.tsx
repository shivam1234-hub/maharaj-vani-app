/**
 * Desktop UI kit — web/Electron only (imported solely from `*.web.tsx`
 * screens). Small primitives that give the React Native Web views desktop
 * behaviour: hover states, native tooltips, context menus, real <select> and
 * range inputs.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { a, useTheme, type DesktopTheme } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;

// ------------------------------------------------------------------ tooltip

/** Native OS tooltip on whatever it wraps (a `title` attribute, layout-neutral). */
export function Tip({ label, children }: { label?: string; children: React.ReactNode }) {
  if (!label) return <>{children}</>;
  return <div title={label} style={{ display: 'contents' }}>{children}</div>;
}

type PState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Pressable with hover/focus state typed (react-native-web provides them). */
export function Hover({
  style, children, onPress, disabled, onContextMenu, accessibilityLabel, ...rest
}: {
  style?: (s: { hovered: boolean; pressed: boolean; focused: boolean }) => StyleProp<ViewStyle>;
  children: React.ReactNode | ((s: { hovered: boolean; pressed: boolean }) => React.ReactNode);
  onPress?: () => void;
  disabled?: boolean;
  onContextMenu?: (e: { clientX: number; clientY: number; preventDefault: () => void }) => void;
  accessibilityLabel?: string;
  onLongPress?: () => void;
  testID?: string;
}) {
  const node = (
    <Pressable
      {...rest}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(s: PState) => style?.({ hovered: !!s.hovered && !disabled, pressed: s.pressed, focused: !!s.focused }) as any}
    >
      {typeof children === 'function'
        ? ((s: PState) => (children as any)({ hovered: !!s.hovered && !disabled, pressed: s.pressed })) as any
        : children}
    </Pressable>
  );
  if (!onContextMenu) return node;
  return (
    <div
      style={{ display: 'contents' }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
    >
      {node}
    </div>
  );
}

// ------------------------------------------------------------------ buttons

export function Button({
  icon, label, onPress, variant = 'secondary', color, size = 'md', disabled, tooltip, iconRight, style,
}: {
  icon?: IconName;
  label?: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'tint';
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  tooltip?: string;
  iconRight?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const c = color ?? t.accent;
  const h = size === 'sm' ? 30 : size === 'lg' ? 44 : 36;
  const fs = size === 'sm' ? 12.5 : size === 'lg' ? 15 : 13.5;
  const is = size === 'sm' ? 14 : size === 'lg' ? 19 : 16;
  const palette = (hovered: boolean) => {
    switch (variant) {
      case 'primary':
        return { bg: hovered ? a(c, 0.88) : c, fg: '#fff', border: 'transparent' };
      case 'danger':
        return { bg: hovered ? a(t.danger, 0.14) : 'transparent', fg: t.danger, border: a(t.danger, 0.45) };
      case 'ghost':
        return { bg: hovered ? t.hover : 'transparent', fg: t.textSub, border: 'transparent' };
      case 'tint':
        return { bg: hovered ? a(c, 0.24) : a(c, 0.14), fg: t.ink(c), border: 'transparent' };
      default:
        return { bg: hovered ? t.surfaceHi : t.surface, fg: t.text, border: t.border };
    }
  };
  return (
    <Tip label={tooltip}>
      <Hover
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label ?? tooltip}
        style={({ hovered, pressed }) => {
          const p = palette(hovered);
          return [
            {
              height: h,
              paddingHorizontal: label ? (size === 'sm' ? 11 : 15) : 0,
              width: label ? undefined : h,
              borderRadius: h / 2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              backgroundColor: p.bg,
              borderWidth: 1,
              borderColor: p.border,
              opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
              transitionDuration: '120ms',
              transitionProperty: 'background-color, border-color, opacity, transform',
              transform: [{ scale: pressed ? 0.98 : 1 }],
            } as any,
            style,
          ];
        }}
      >
        {({ hovered }) => {
          const p = palette(hovered);
          return (
            <>
              {icon ? <Ionicons name={icon} size={is} color={p.fg} /> : null}
              {label ? (
                <Text style={{ color: p.fg, fontSize: fs, fontWeight: '700' }} numberOfLines={1}>
                  {label}
                </Text>
              ) : null}
              {iconRight ? <Ionicons name={iconRight} size={is - 2} color={p.fg} /> : null}
            </>
          );
        }}
      </Hover>
    </Tip>
  );
}

export function IconButton({
  icon, onPress, label, size = 34, iconSize, color, active, disabled, filled,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  iconSize?: number;
  color?: string;
  active?: boolean;
  disabled?: boolean;
  filled?: boolean;
}) {
  const t = useTheme();
  const c = color ?? t.textSub;
  return (
    <Tip label={label}>
      <Hover
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={label}
        style={({ hovered, pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? (hovered ? a(c, 0.85) : c) : active ? a(t.accent, 0.16) : hovered ? t.hover : 'transparent',
          opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
          transitionDuration: '120ms',
          transform: [{ scale: pressed ? 0.94 : 1 }],
        } as any)}
      >
        {({ hovered }) => (
          <Ionicons
            name={icon}
            size={iconSize ?? Math.round(size * 0.52)}
            color={filled ? '#fff' : active ? t.accentText : hovered ? t.text : c}
          />
        )}
      </Hover>
    </Tip>
  );
}

export function Chip({
  label, on, onPress, color, count, icon,
}: { label: string; on: boolean; onPress: () => void; color?: string; count?: number; icon?: IconName }) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Hover
      onPress={onPress}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: on ? c : t.border,
        backgroundColor: on ? a(c, 0.16) : hovered ? t.surfaceHi : t.surface,
        transitionDuration: '120ms',
      } as any)}
    >
      {icon ? <Ionicons name={icon} size={13} color={on ? t.ink(c) : t.textDim} /> : null}
      <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '600', color: on ? t.ink(c) : t.textSub }} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? (
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: on ? t.ink(c) : t.textFaint }}>{count.toLocaleString()}</Text>
      ) : null}
    </Hover>
  );
}

// ------------------------------------------------------------------ inputs

export function SearchField({
  value, onChange, placeholder, onSubmit, inputRef, autoFocus, onFocus, onBlur, onKeyPress, style, hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  inputRef?: React.Ref<TextInput>;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyPress?: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  hint?: string;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          height: 38,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: focused ? t.surface : t.surfaceHi,
          borderWidth: 1,
          borderColor: focused ? t.accent : t.border,
          transitionDuration: '120ms',
        } as any,
        style,
      ]}
    >
      <Ionicons name="search" size={16} color={focused ? t.accentText : t.textDim} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.textFaint}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        onKeyPress={(e) => onKeyPress?.(e.nativeEvent.key)}
        style={{ flex: 1, color: t.text, fontSize: 14, outlineStyle: 'none', height: 36 } as any}
        autoCorrect={false}
        spellCheck={false}
      />
      {value ? (
        <IconButton icon="close-circle" label="Clear" size={24} iconSize={16} color={t.textFaint} onPress={() => onChange('')} />
      ) : hint ? (
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.textFaint, fontSize: 11, fontWeight: '600' }}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Select<T extends string | number>({
  value, options, onChange, label, width,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label?: string;
  width?: number | string;
}) {
  const t = useTheme();
  const arrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${encodeURIComponent(t.textDim)}' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;
  return (
    <select
      className="vv-select"
      aria-label={label}
      title={label}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const hit = options.find((o) => String(o.value) === raw);
        if (hit) onChange(hit.value);
      }}
      style={{
        width,
        color: t.text,
        backgroundColor: t.surface,
        border: `1px solid ${t.border}`,
        backgroundImage: arrow,
        fontWeight: 600,
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)} style={{ background: t.surface, color: t.text }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Native range input, styled (see utils/desktopStyles.web.ts). */
export function Range({
  value, max, onChange, onCommit, color, rest, width = '100%', label, step,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  color: string;
  rest: string;
  width?: number | string;
  label: string;
  step?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <input
      type="range"
      className="vv-range"
      aria-label={label}
      min={0}
      max={max || 1}
      step={step ?? 'any'}
      value={max > 0 ? value : 0}
      disabled={max <= 0}
      onChange={(e) => onChange(Number(e.target.value))}
      onMouseUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      style={{
        width,
        ['--vv-range-pct' as any]: `${pct}%`,
        ['--vv-range-fill' as any]: color,
        ['--vv-range-rest' as any]: rest,
      }}
    />
  );
}

// ------------------------------------------------------------------ display

export function ProgressBar({ frac, color, height = 4, track }: { frac: number; color: string; height?: number; track?: string }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? t.surfaceHi, overflow: 'hidden' }}>
      <View style={{ height, width: `${Math.max(0, Math.min(1, frac)) * 100}%`, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Badge({ text, color, solid }: { text: string; color: string; solid?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: solid ? color : a(color, 0.15), alignSelf: 'flex-start' }}>
      <Text style={{ color: solid ? '#fff' : t.ink(color), fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function SectionHeader({
  title, subtitle, right, style, icon,
}: { title: string; subtitle?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 14 }, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Ionicons name={icon} size={17} color={t.textSub} /> : null}
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
        </View>
        {subtitle ? <Text style={{ color: t.textDim, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Empty({
  icon, title, text, action,
}: { icon: IconName; title: string; text?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceHi, marginBottom: 6 }}>
        <Ionicons name={icon} size={28} color={t.textDim} />
      </View>
      <Text style={{ color: t.text, fontSize: 15.5, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: t.textDim, fontSize: 13, textAlign: 'center', maxWidth: 420, lineHeight: 19 }}>{text}</Text> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Spinner({ label, color }: { label?: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 }}>
      <ActivityIndicator color={color ?? t.accent} />
      {label ? <Text style={{ color: t.textDim, fontSize: 12.5 }}>{label}</Text> : null}
    </View>
  );
}

/** Animated three-bar "now playing" glyph. */
export function Equalizer({ color, playing, size = 14 }: { color: string; playing: boolean; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: size, width: size }}>
      {[0, 0.25, 0.5].map((d, i) => (
        <span
          key={i}
          className={playing ? 'vv-eq-bar' : undefined}
          style={{
            display: 'block', width: Math.max(2, size / 5), height: '100%', background: color, borderRadius: 1,
            animationDelay: `${d}s`, transform: playing ? undefined : `scaleY(${[0.5, 0.8, 0.35][i]})`, transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  );
}

export function Card({ children, style, padding = 18 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padding?: number }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, padding }, style]}>
      {children}
    </View>
  );
}

export function Kicker({ text, color, style }: { text: string; color?: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text style={[{ color: color ? t.ink(color) : t.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, style]}>
      {text}
    </Text>
  );
}

// ------------------------------------------------------------------ menus

export interface MenuItem {
  label?: string;
  icon?: IconName;
  left?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  hint?: string;
}

interface MenuState { x: number; y: number; items: MenuItem[]; width: number }

const MenuCtx = createContext<{ open: (x: number, y: number, items: MenuItem[], width?: number) => void; close: () => void } | null>(null);

/** Hosts the app's one context menu / dropdown. Esc or a click outside closes it. */
export function MenuHost({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const t = useTheme();
  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((x: number, y: number, items: MenuItem[], width = 240) => setMenu({ x, y, items, width }), []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); }
    };
    const onScroll = () => setMenu(null);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menu]);

  const ctx = useMemo(() => ({ open, close }), [open, close]);
  let pos: { left: number; top: number } | null = null;
  if (menu && typeof window !== 'undefined') {
    const estH = menu.items.reduce((h, i) => h + (i.separator ? 9 : 34), 12);
    const left = Math.min(menu.x, window.innerWidth - menu.width - 8);
    const top = menu.y + estH > window.innerHeight - 8 ? Math.max(8, menu.y - estH) : menu.y;
    pos = { left: Math.max(8, left), top };
  }

  return (
    <MenuCtx.Provider value={ctx}>
      {children}
      {menu && pos ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          onMouseDown={close}
          onContextMenu={(e) => { e.preventDefault(); close(); }}
        >
          <div
            className="vv-pop-in"
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
            style={{
              position: 'fixed', left: pos.left, top: pos.top, width: menu.width,
              maxHeight: window.innerHeight - 16, overflowY: 'auto',
              background: t.surface, border: `1px solid ${t.borderHi}`, borderRadius: 10,
              boxShadow: t.shadow, padding: 5,
            }}
          >
            {menu.items.map((it, i) =>
              it.separator ? (
                <div key={i} style={{ height: 1, background: t.border, margin: '4px 6px' }} />
              ) : (
                <MenuRow key={i} item={it} t={t} onDone={close} />
              ),
            )}
          </div>
        </div>
      ) : null}
    </MenuCtx.Provider>
  );
}

function MenuRow({ item, t, onDone }: { item: MenuItem; t: DesktopTheme; onDone: () => void }) {
  const [hover, setHover] = useState(false);
  const color = item.danger ? t.danger : t.text;
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (item.disabled) return;
        onDone();
        item.onPress?.();
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, minHeight: 34, padding: '0 10px', borderRadius: 7,
        cursor: item.disabled ? 'default' : 'pointer', opacity: item.disabled ? 0.45 : 1,
        background: hover && !item.disabled ? (item.danger ? a(t.danger, 0.12) : t.hover) : 'transparent',
        color, fontSize: 13, fontWeight: item.checked ? 700 : 500,
      }}
    >
      {item.left ?? (item.icon ? <Ionicons name={item.icon} size={15} color={item.danger ? t.danger : t.textSub} /> : <span style={{ width: 15 }} />)}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
      {item.hint ? <span style={{ color: t.textFaint, fontSize: 11.5 }}>{item.hint}</span> : null}
      {item.checked ? <Ionicons name="checkmark" size={15} color={t.accentText} /> : null}
    </div>
  );
}

export function useMenu() {
  const ctx = useContext(MenuCtx);
  if (!ctx) throw new Error('useMenu outside MenuHost');
  return ctx;
}

/**
 * Anchor for dropdown menus: wrap the trigger in `<div ref={ref}>` and call
 * `at()` for the point under it (MenuHost flips it upwards near the bottom).
 */
export function useAnchor() {
  const ref = useRef<HTMLDivElement>(null);
  const at = useCallback((alignRight?: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return { x: 200, y: 200 };
    return { x: alignRight ? r.right - alignRight : r.left, y: r.bottom + 4, top: r.top };
  }, []);
  return { ref, at };
}

export const kitStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
