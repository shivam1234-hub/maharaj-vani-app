import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSongGroups, songCounts, songsInGroup } from '../../data/songIndex';
import { normalize } from '../../utils/songs';
import { SONGS_COLOR, songHref } from '../../utils/shastraNav';
import { C, R, alpha } from '../../constants/theme';

/** Every prayer and Vaisnava song in the catalogue, by group, with how many lectures explain it. */
export default function SongsScreen() {
  const [q, setQ] = useState('');
  const groups = useMemo(
    () =>
      getSongGroups().map((g) => ({
        ...g,
        songs: songsInGroup(g.key).map((s) => ({ ...s, counts: songCounts(s.id) })),
      })),
    [],
  );
  const needle = normalize(q).trim();
  const shown = groups
    .map((g) => ({
      ...g,
      songs: needle
        ? g.songs.filter((s) => normalize(`${s.name} ${s.author} ${s.line}`).includes(needle))
        : g.songs,
    }))
    .filter((g) => g.songs.length);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 150 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.hero, { borderColor: SONGS_COLOR + alpha(0.35), backgroundColor: SONGS_COLOR + alpha(0.08) }]}>
        <Ionicons name="musical-notes" size={26} color={SONGS_COLOR} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Prayers & Songs</Text>
          <Text style={styles.heroSub}>
            Lectures explaining the daily prayers, the astakas, the songs of the acaryas and the great
            prayers of the Bhagavatam.
          </Text>
        </View>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={C.textDim} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Find a prayer or song — Gurvastakam, Jiv Jago…"
          placeholderTextColor={C.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={C.textDim} />
          </Pressable>
        ) : null}
      </View>

      {shown.map((g) => (
        <View key={g.key}>
          <Text style={styles.group}>{g.name}</Text>
          <Text style={styles.groupBlurb}>{g.blurb}</Text>
          <View style={styles.list}>
            {g.songs.map((s, i) => (
              <Pressable
                key={s.id}
                onPress={() => router.push(songHref(s.id) as any)}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.author} numberOfLines={1}>{s.author}</Text>
                  <Text style={styles.meta}>
                    {s.counts.all ? `${s.counts.all} lecture${s.counts.all === 1 ? '' : 's'}` : 'YouTube only'}
                    {s.counts.mine ? ` · ${s.counts.mine} by your speakers` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.textFaint} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {!shown.length && <Text style={styles.empty}>Nothing matches “{q}”.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pressed: { opacity: 0.75 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: R.xl, borderWidth: 1,
  },
  heroTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  heroSub: { color: C.textSub, fontSize: 12, marginTop: 3, lineHeight: 17 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 4, paddingHorizontal: 12, minHeight: 44,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 8 },
  group: { color: C.text, fontSize: 16, fontWeight: '800', marginHorizontal: 16, marginTop: 22 },
  groupBlurb: { color: C.textDim, fontSize: 11.5, marginHorizontal: 16, marginTop: 2, marginBottom: 8 },
  list: {
    marginHorizontal: 16,
    backgroundColor: C.surfaceLo, borderRadius: R.lg, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: C.border },
  name: { color: C.text, fontSize: 14, fontWeight: '700' },
  author: { color: C.textSub, fontSize: 11.5, marginTop: 2 },
  meta: { color: SONGS_COLOR, fontSize: 11, fontWeight: '700', marginTop: 4 },
  empty: { color: C.textDim, textAlign: 'center', marginTop: 40 },
});
