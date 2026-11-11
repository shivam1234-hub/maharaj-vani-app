import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAHARAJAS, MAHARAJ_ORDER, honoured } from '../data/maharajas';
import { useVerseSpeaker } from '../hooks/useVerses';
import { C, R, alpha } from '../constants/theme';

/**
 * Whose lectures come first on the verse screens, and whose are played by
 * "Play in sequence". 'All' ranks every catalogued speaker equally; any
 * verse the chosen one never spoke on falls back to the others.
 */
export default function VerseSpeakerChips() {
  const [speaker, setSpeaker] = useVerseSpeaker();
  const items = [{ key: 'all' as const, label: 'All speakers', accent: C.textSub }, ...MAHARAJ_ORDER.map((k) => ({
    key: k,
    label: honoured(MAHARAJAS[k].short),
    accent: MAHARAJAS[k].accent,
  }))];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.strip}
    >
      {items.map((it) => {
        const on = speaker === it.key;
        return (
          <Pressable
            key={it.key}
            onPress={() => setSpeaker(it.key)}
            style={({ pressed }) => [
              styles.pill,
              on && { backgroundColor: it.accent + alpha(0.16), borderColor: it.accent },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.dot, { backgroundColor: on ? it.accent : C.textFaint }]} />
            <Text style={[styles.text, { color: on ? it.accent : C.textDim }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36,
    paddingHorizontal: 12, borderRadius: R.pill,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12.5, fontWeight: '700' },
});
