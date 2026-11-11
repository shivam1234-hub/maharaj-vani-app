import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAHARAJAS, maharajOf, GUEST_ACCENT, honoured } from '../data/maharajas';
import { Recording, formatDuration, formatRecordingDate } from '../data/types';
import { GlobalVideoHit, useGlobalSearch } from '../hooks/useGlobalSearch';

type Scope = 'all' | 'audio' | 'video';

/** One list holds both kinds, so they interleave under a single scroll. */
type Row =
  | { kind: 'header'; label: string; key: string }
  | { kind: 'audio'; rec: Recording }
  | { kind: 'video'; vid: GlobalVideoHit };

const GUEST_SPEAKER = { accent: GUEST_ACCENT, initials: 'ISK' };

export default function GlobalSearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');

  const { audio, audioTotal, videos, videosLoading, videosError, audioByMaharaj } =
    useGlobalSearch(query);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (scope !== 'video' && audio.length) {
      out.push({ kind: 'header', key: 'h-audio', label: `Audio archive · ${audioTotal}` });
      for (const rec of audio) out.push({ kind: 'audio', rec });
    }
    if (scope !== 'audio' && videos.length) {
      out.push({ kind: 'header', key: 'h-video', label: `YouTube · ${videos.length}` });
      for (const vid of videos) out.push({ kind: 'video', vid });
    }
    return out;
  }, [scope, audio, audioTotal, videos]);

  const hasQuery = query.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#c9cee8" />
        </TouchableOpacity>
        <Text style={styles.title}>Search everything</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#5a6288" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="All Maharajas, audio and YouTube…"
          placeholderTextColor="#4a5178"
          style={styles.input}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        {hasQuery && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color="#4a5178" />
          </TouchableOpacity>
        )}
      </View>

      {hasQuery && (
        <View style={styles.scopeRow}>
          {(['all', 'audio', 'video'] as const).map((s) => {
            const on = scope === s;
            const label =
              s === 'all' ? 'Everything' : s === 'audio' ? `Audio ${audioTotal}` : `YouTube ${videos.length}`;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setScope(s)}
                style={[styles.scopeChip, on && styles.scopeChipOn]}
              >
                <Text style={[styles.scopeText, on && styles.scopeTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {hasQuery && audioByMaharaj.length > 0 && (
        <View style={styles.tallyRow}>
          {audioByMaharaj.map(({ key, count }) => (
            <View key={key} style={styles.tally}>
              <View style={[styles.dot, { backgroundColor: MAHARAJAS[key].accent }]} />
              <Text style={styles.tallyText}>
                {honoured(MAHARAJAS[key].short)} {count}
              </Text>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(r) =>
          r.kind === 'header' ? r.key : r.kind === 'audio' ? r.rec.id : `v-${r.vid.videoId}`
        }
        contentContainerStyle={{ paddingBottom: 150 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text style={styles.sectionHeader}>{item.label}</Text>;
          }

          if (item.kind === 'audio') {
            const rec = item.rec;
            // Global search only covers the catalogues, so a guest never
            // reaches here — but fall back rather than crash if one does.
            const m = maharajOf(rec.maharaj) ?? GUEST_SPEAKER;
            return (
              <Pressable
                onPress={() => router.push(`/lecture/${rec.id}`)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={[styles.accentBar, { backgroundColor: m.accent }]} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{rec.title}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.chip, { backgroundColor: m.accent + '22' }]}>
                      <Text style={[styles.chipText, { color: m.accent }]}>{m.initials}</Text>
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {[
                        rec.date ? formatRecordingDate(rec.date) : rec.year ? String(rec.year) : null,
                        rec.location,
                        rec.scripture,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#3a4166" />
              </Pressable>
            );
          }

          const v = item.vid;
          const m = MAHARAJAS[v.maharaj];
          return (
            <Pressable
              onPress={() =>
                router.push(
                  `/video/${v.videoId}?title=${encodeURIComponent(v.title)}` +
                    `&channel=${encodeURIComponent(v.channel ?? '')}` +
                    `&thumb=${encodeURIComponent(v.thumbnail ?? '')}`,
                )
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={[styles.accentBar, { backgroundColor: '#E74C3C' }]} />
              {v.thumbnail ? (
                <Image source={{ uri: v.thumbnail }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Ionicons name="logo-youtube" size={16} color="#E74C3C" />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>{v.title}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.chip, { backgroundColor: m.accent + '22' }]}>
                    <Text style={[styles.chipText, { color: m.accent }]}>{m.initials}</Text>
                  </View>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {[v.channel, formatDuration(v.durationSec)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
              <Ionicons name="logo-youtube" size={15} color="#E74C3C" />
            </Pressable>
          );
        }}
        ListFooterComponent={
          scope !== 'audio' && hasQuery ? (
            <View style={styles.footer}>
              {videosLoading ? (
                <>
                  <ActivityIndicator color="#E74C3C" size="small" />
                  <Text style={styles.footerText}>Searching YouTube…</Text>
                </>
              ) : videosError ? (
                <Text style={styles.footerText}>{videosError}</Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={hasQuery ? 'search-outline' : 'planet-outline'}
              size={40}
              color="#2a3050"
            />
            <Text style={styles.emptyTitle}>
              {hasQuery ? 'Nothing found yet' : 'Search across every Maharaja'}
            </Text>
            <Text style={styles.emptyText}>
              {hasQuery
                ? 'No archive recordings match. YouTube results may still be loading.'
                : 'One box for all three Maharajas — the downloadable audio archive and live YouTube results together.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16 },
  backBtn: { padding: 2 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 13, minHeight: 46,
    backgroundColor: '#121629', borderRadius: 12,
    borderWidth: 1, borderColor: '#232a4d',
  },
  input: { flex: 1, color: '#e8ebf7', fontSize: 14.5, paddingVertical: 10 },

  scopeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  scopeChip: {
    minHeight: 34, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 13, borderRadius: 9,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  scopeChipOn: { backgroundColor: '#1d2450', borderColor: '#3d4a8a' },
  scopeText: { color: '#98a0c8', fontSize: 12.5, fontWeight: '700' },
  scopeTextOn: { color: '#e8ebf7' },

  tallyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginHorizontal: 16, marginTop: 10 },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tallyText: { color: '#6b73a0', fontSize: 11.5, fontWeight: '600' },

  sectionHeader: {
    color: '#5a6288', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6,
    textTransform: 'uppercase', marginHorizontal: 16, marginTop: 18, marginBottom: 6,
  },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#121629', marginHorizontal: 16, marginVertical: 4,
    borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1a2040',
    paddingRight: 12,
  },
  pressed: { opacity: 0.75 },
  accentBar: { width: 3, alignSelf: 'stretch' },
  thumb: { width: 62, height: 40, borderRadius: 6, backgroundColor: '#12162a' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, paddingVertical: 11 },
  cardTitle: { color: '#e3e7f6', fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  chip: { paddingHorizontal: 6, minHeight: 18, borderRadius: 5, justifyContent: 'center' },
  chipText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  cardMeta: { color: '#5a6288', fontSize: 11, flex: 1 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  footerText: { color: '#5a6288', fontSize: 12 },

  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: '#c9cee8', fontSize: 15, fontWeight: '700', marginTop: 6 },
  emptyText: { color: '#5a6288', fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
});
