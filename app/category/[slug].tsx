import React, { useMemo, useState } from 'react';
import {
  Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import LectureCard from '../../components/LectureCard';
import { SearchBar } from '../../components/SearchBar';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useDownload } from '../../contexts/DownloadContext';
import { getCatalog } from '../../hooks/useLectures';
import { getCategoryMeta } from '../../data/types';

type Sort = 'newest' | 'oldest' | 'title';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const { active, maharaj } = useMaharaj();
  const { isDownloaded, downloadBatch } = useDownload();

  const category = String(slug ?? '');
  const meta = getCategoryMeta(category);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [folder, setFolder] = useState<string | null>(null);

  React.useEffect(() => {
    navigation.setOptions({ title: meta.label });
  }, [meta.label, navigation]);

  const all = useMemo(
    () => getCatalog(active).filter((r) => r.category === category),
    [active, category],
  );

  // Sub-folders inside a category are the series ("Canto 01", "Chapter-09").
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) if (r.folder) counts.set(r.folder, (counts.get(r.folder) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }, [all]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = all.filter((r) => {
      if (folder && r.folder !== folder) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q) ||
        (r.scripture ?? '').toLowerCase().includes(q) ||
        String(r.year ?? '').includes(q)
      );
    });

    out = out.slice();
    if (sort === 'newest') out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    else if (sort === 'oldest') out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    else out.sort((a, b) => a.title.localeCompare(b.title));

    return out;
  }, [all, query, sort, folder]);

  const handleSaveAll = () => {
    const pending = results.filter((r) => !isDownloaded(r.id));
    if (!pending.length) {
      Alert.alert('Nothing to download', 'Every recording here is already saved.');
      return;
    }
    const bytes = pending.reduce((s, r) => s + r.sizeBytes, 0);
    Alert.alert(
      `Download ${pending.length} recordings?`,
      `This will use about ${(bytes / 1024 ** 3).toFixed(2)} GB of storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () =>
            downloadBatch(
              pending.map((r) => ({
                id: r.id,
                url: r.url,
                title: r.title,
                maharaj: r.maharaj,
                sizeBytes: r.sizeBytes,
              })),
            ),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { borderColor: meta.color + '33' }]}>
        <View style={[styles.icon, { backgroundColor: meta.color + '1e' }]}>
          <Ionicons name={meta.icon as any} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{meta.label}</Text>
          <Text style={styles.headerSub}>
            {results.length.toLocaleString()} of {all.length.toLocaleString()} · {maharaj.short}
          </Text>
        </View>
        <TouchableOpacity onPress={handleSaveAll} style={styles.saveBtn} hitSlop={6}>
          <Ionicons name="cloud-download-outline" size={15} color={meta.color} />
          <Text style={[styles.saveText, { color: meta.color }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <SearchBar value={query} onChange={setQuery} placeholder={`Search in ${meta.label}…`} />

      <View style={styles.sortRow}>
        {(['newest', 'oldest', 'title'] as Sort[]).map((s) => {
          const on = sort === s;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setSort(s)}
              style={[styles.chip, on && { backgroundColor: meta.color + '26', borderColor: meta.color }]}
            >
              <Text style={[styles.chipText, on && { color: meta.color, fontWeight: '700' }]}>
                {s === 'newest' ? 'Newest' : s === 'oldest' ? 'Oldest' : 'A–Z'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {folders.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipStrip}
        >
          {[{ key: '', count: all.length }, ...folders].map((item) => {
            const on = item.key ? folder === item.key : folder === null;
            return (
              <TouchableOpacity
                key={item.key || 'all'}
                onPress={() => setFolder(item.key || null)}
                style={[
                  styles.chip,
                  on && { backgroundColor: meta.color + '26', borderColor: meta.color },
                ]}
              >
                <Text
                  style={[styles.chipText, on && { color: meta.color, fontWeight: '700' }]}
                  numberOfLines={1}
                >
                  {item.key || 'All'} ({item.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <LectureCard recording={item} hideFolder={Boolean(folder)} />}
        contentContainerStyle={{ paddingBottom: 150, paddingTop: 6 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={38} color="#2a3050" />
            <Text style={styles.emptyTitle}>Nothing here</Text>
            <Text style={styles.emptyText}>Try clearing the search or the series filter.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    margin: 16, marginBottom: 4, padding: 13,
    backgroundColor: '#121629', borderRadius: 13, borderWidth: 1,
  },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  headerSub: { color: '#5a6288', fontSize: 11.5, marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveText: { fontSize: 12, fontWeight: '700' },
  sortRow: { flexDirection: 'row', gap: 7, marginHorizontal: 16, marginBottom: 6 },
  chipStrip: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: {
    // minHeight + centring, NOT vertical padding alone. Measured on device,
    // the chip box came out 75px while its own padding took 47px, leaving the
    // 13sp label just 23px of the ~40px it needs — so the text overflowed and
    // was clipped. A floor on the height cannot be squeezed, and the label is
    // centred inside it.
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13, paddingVertical: 4, borderRadius: 9, maxWidth: 230,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  chipText: {
    color: '#c2c8e4', fontSize: 12.5, fontWeight: '600',
  },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: '#c9cee8', fontSize: 15, fontWeight: '700', marginTop: 6 },
  emptyText: { color: '#5a6288', fontSize: 12.5, textAlign: 'center' },
});
