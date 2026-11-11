import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAHARAJAS, MAHARAJ_ORDER, honoured } from '../data/maharajas';
import { useMaharaj } from '../contexts/MaharajContext';
import MaharajAvatar from './MaharajAvatar';
import { C, R, alpha } from '../constants/theme';

/**
 * The app-wide switch between the Maharajas. Every list, search and
 * category screen reads the active key, so choosing one swaps the whole
 * catalogue in place.
 *
 * A horizontal strip rather than equal-width segments: with four Maharajas,
 * one of them named "Bhakti Ashraya Vaishnava Swami", equal segments either
 * truncated the names or wrapped them to three lines. The names of these
 * teachers are never cut short, so the strip scrolls instead.
 *
 * Full (Home): avatar discs with the name beneath.
 * Compact (Search, Video): one-line pills.
 */
export default function MaharajSwitch({ compact = false }: { compact?: boolean }) {
  const { active, setActive } = useMaharaj();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  // Keep the selected one in view when the screen opens scrolled elsewhere.
  useEffect(() => {
    const x = offsets.current[active];
    if (x != null) scrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [active]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={compact ? styles.stripCompact : styles.strip}
    >
      {MAHARAJ_ORDER.map((key) => {
        const m = MAHARAJAS[key];
        const on = key === active;

        if (compact) {
          return (
            <Pressable
              key={key}
              onLayout={(e) => (offsets.current[key] = e.nativeEvent.layout.x)}
              onPress={() => setActive(key)}
              style={({ pressed }) => [
                styles.pill,
                on && { backgroundColor: m.accent + alpha(0.16), borderColor: m.accent },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={m.name}
            >
              <View style={[styles.dot, { backgroundColor: on ? m.accent : C.textFaint }]} />
              <Text style={[styles.pillText, { color: on ? m.accent : C.textDim }]}>{honoured(m.short)}</Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={key}
            onLayout={(e) => (offsets.current[key] = e.nativeEvent.layout.x)}
            onPress={() => setActive(key)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={m.name}
          >
            <MaharajAvatar maharaj={m} size={54} active={on} />
            <Text
              numberOfLines={3}
              style={[
                styles.name,
                on ? { color: C.text, fontWeight: '800' } : { color: C.textDim },
              ]}
            >
              {honoured(m.short)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, gap: 4 },
  item: { width: 88, alignItems: 'center', gap: 7, paddingVertical: 4 },
  name: { fontSize: 11.5, lineHeight: 14.5, textAlign: 'center', fontWeight: '600' },

  stripCompact: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: R.pill,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  pillText: { fontSize: 12.5, fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pressed: { opacity: 0.7 },
});
