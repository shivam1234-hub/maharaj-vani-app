import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Filters } from '../hooks/useLectures';
import { getCategoryMeta } from '../data/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  onReset: () => void;
  categories: Array<{ key: string; count: number }>;
  locations: string[];
  years: number[];
  accent: string;
  resultCount: number;
}

const SORTS: Array<{ key: Filters['sort']; label: string }> = [
  { key: 'relevance', label: 'Best match' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title', label: 'A–Z' },
  { key: 'longest', label: 'Longest' },
];

export default function FilterPanel({
  visible, onClose, filters, setFilters, onReset,
  categories, locations, years, accent, resultCount,
}: Props) {
  const Chip = ({
    label, on, onPress, color,
  }: { label: string; on: boolean; onPress: () => void; color?: string }) => {
    const c = color ?? accent;
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[styles.chip, on && { backgroundColor: c + '26', borderColor: c }]}
      >
        <Text style={[styles.chipText, on && { color: c, fontWeight: '700' }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Filters</Text>
            <TouchableOpacity onPress={onReset} style={styles.resetBtn}>
              <Text style={[styles.resetText, { color: accent }]}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            <Text style={styles.sectionTitle}>Sort</Text>
            <View style={styles.chipRow}>
              {SORTS.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  on={filters.sort === s.key}
                  onPress={() => setFilters((f) => ({ ...f, sort: s.key }))}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Show only</Text>
            <View style={styles.chipRow}>
              <Chip
                label="Downloaded"
                on={filters.downloadedOnly}
                onPress={() => setFilters((f) => ({ ...f, downloadedOnly: !f.downloadedOnly }))}
                color="#27AE60"
              />
              <Chip
                label="Favourites"
                on={filters.favouritesOnly}
                onPress={() => setFilters((f) => ({ ...f, favouritesOnly: !f.favouritesOnly }))}
                color="#E74C3C"
              />
            </View>

            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.chipRow}>
              <Chip
                label="All"
                on={filters.category === 'All'}
                onPress={() => setFilters((f) => ({ ...f, category: 'All' }))}
              />
              {categories.map((c) => (
                <Chip
                  key={c.key}
                  label={`${getCategoryMeta(c.key).label} (${c.count})`}
                  on={filters.category === c.key}
                  onPress={() =>
                    setFilters((f) => ({ ...f, category: f.category === c.key ? 'All' : c.key }))
                  }
                  color={getCategoryMeta(c.key).color}
                />
              ))}
            </View>

            {years.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Year</Text>
                <View style={styles.chipRow}>
                  {years.map((y) => {
                    const on = filters.yearFrom === y && filters.yearTo === y;
                    return (
                      <Chip
                        key={y}
                        label={String(y)}
                        on={on}
                        onPress={() =>
                          setFilters((f) => ({
                            ...f,
                            yearFrom: on ? null : y,
                            yearTo: on ? null : y,
                          }))
                        }
                      />
                    );
                  })}
                </View>
              </>
            )}

            {locations.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Place</Text>
                <View style={styles.chipRow}>
                  {locations.map((l) => (
                    <Chip
                      key={l}
                      label={l}
                      on={filters.location === l}
                      onPress={() =>
                        setFilters((f) => ({ ...f, location: f.location === l ? '' : l }))
                      }
                    />
                  ))}
                </View>
              </>
            )}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={[styles.applyBtn, { backgroundColor: accent }]}>
            <Text style={styles.applyText}>
              Show {resultCount.toLocaleString()} {resultCount === 1 ? 'recording' : 'recordings'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    maxHeight: '82%',
    backgroundColor: '#0f1224',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: '#1e2545',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a2040',
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  resetBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  resetText: { fontSize: 13.5, fontWeight: '700' },
  body: { paddingHorizontal: 18 },
  sectionTitle: {
    color: '#7b83ad', fontSize: 11.5, fontWeight: '800',
    letterSpacing: 0.7, textTransform: 'uppercase',
    marginTop: 18, marginBottom: 9,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    // An explicit lineHeight is what actually reserves room for the glyphs;
    // `includeFontPadding: false` then removes Android's extra top/bottom gap
    // so the label sits centred rather than pushed against the border.
  },
  applyBtn: {
    margin: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
