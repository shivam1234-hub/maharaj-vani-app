import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from '../../components/SearchBar';
import MaharajSwitch from '../../components/MaharajSwitch';
import LectureCard from '../../components/LectureCard';
import FilterPanel from '../../components/FilterPanel';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useLectures } from '../../hooks/useLectures';
import { getCategoryMeta } from '../../data/types';

export default function BrowseScreen() {
  const { active, maharaj } = useMaharaj();
  const { isDownloaded, downloadBatch } = useDownload();
  const { isFavourite } = useLibrary();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ favourites?: string; q?: string }>();

  const [showFilters, setShowFilters] = useState(false);

  const {
    results, total, filters, setFilters, resetFilters,
    categories, locations, years, activeFilterCount,
  } = useLectures({ maharaj: active, isDownloaded, isFavourite });

  // Deep links from Home ("/browse?favourites=1") preset the filter.
  useEffect(() => {
    if (params.favourites === '1') setFilters((f) => ({ ...f, favouritesOnly: true }));
    if (params.q) setFilters((f) => ({ ...f, query: String(params.q) }));
  }, [params.favourites, params.q, setFilters]);

  const topCategories = useMemo(() => categories.slice(0, 8), [categories]);

  const handleDownloadAll = () => {
    const pending = results.filter((r) => !isDownloaded(r.id));
    if (pending.length === 0) {
      Alert.alert('Nothing to download', 'Every recording in this list is already saved.');
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <MaharajSwitch compact />

      <SearchBar
        value={filters.query}
        onChange={(query) => setFilters((f) => ({ ...f, query }))}
        onFilterPress={() => setShowFilters(true)}
        activeFilterCount={activeFilterCount}
        placeholder="Search title, verse, place, year…"
      />

      {/* ScrollView, not a horizontal FlatList — see the note in youtube.tsx:
          the FlatList squashed the chips and clipped their labels. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipStrip}
      >
        {[{ key: 'All', count: total }, ...topCategories].map((item) => {
          const on = filters.category === item.key;
          const color = item.key === 'All' ? maharaj.accent : getCategoryMeta(item.key).color;
          const label = item.key === 'All' ? 'All' : getCategoryMeta(item.key).label;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() =>
                setFilters((f) => ({ ...f, category: on && item.key !== 'All' ? 'All' : item.key }))
              }
              style={[styles.chip, on && { backgroundColor: color + '26', borderColor: color }]}
            >
              <Text style={[styles.chipText, on && { color, fontWeight: '700' }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {total.toLocaleString()} {total === 1 ? 'recording' : 'recordings'}
          {results.length < total ? ` · showing ${results.length}` : ''}
        </Text>
        {results.length > 0 && (
          <TouchableOpacity onPress={handleDownloadAll} style={styles.dlAllBtn} hitSlop={6}>
            <Ionicons name="cloud-download-outline" size={14} color={maharaj.accent} />
            <Text style={[styles.dlAllText, { color: maharaj.accent }]}>Save list</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <LectureCard recording={item} />}
        contentContainerStyle={{ paddingBottom: 150, paddingTop: 2 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={38} color="#2a3050" />
            <Text style={styles.emptyTitle}>No recordings match</Text>
            <Text style={styles.emptyText}>
              Try fewer words, or clear the filters.
            </Text>
            {activeFilterCount > 0 && (
              <TouchableOpacity
                onPress={resetFilters}
                style={[styles.emptyBtn, { borderColor: maharaj.accent }]}
              >
                <Text style={[styles.emptyBtnText, { color: maharaj.accent }]}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <FilterPanel
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        setFilters={setFilters}
        onReset={resetFilters}
        categories={categories}
        locations={locations}
        years={years}
        accent={maharaj.accent}
        resultCount={total}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
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
    paddingHorizontal: 13, paddingVertical: 4, borderRadius: 9,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  chipText: {
    color: '#c2c8e4', fontSize: 13, fontWeight: '600',
  },
  countRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
  },
  countText: { color: '#5a6288', fontSize: 11.5, fontWeight: '600' },
  dlAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dlAllText: { fontSize: 11.5, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: '#c9cee8', fontSize: 15, fontWeight: '700', marginTop: 6 },
  emptyText: { color: '#5a6288', fontSize: 12.5, textAlign: 'center' },
  emptyBtn: {
    marginTop: 12, paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700' },
});
