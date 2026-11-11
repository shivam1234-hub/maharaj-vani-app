import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, a } from '../../components/desktop/theme';
import { Button, Empty, Hover, SearchField, Select } from '../../components/desktop/kit';
import { RecordingTable, useRecordingActions, type SortKey } from '../../components/desktop/recordings';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useLectures } from '../../hooks/useLectures';
import { getCategoryMeta } from '../../data/types';
import { honoured } from '../../data/maharajas';

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'relevance', label: 'Best match' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'longest', label: 'Longest first' },
];

/**
 * Desktop Browse (the phone's Search tab): a permanent filter rail on the
 * left — sort, show-only, category, year, place — and the active speaker's
 * catalogue as a sortable table.
 */
export default function BrowseScreen() {
  const t = useTheme();
  const { active, maharaj } = useMaharaj();
  const { isDownloaded } = useDownload();
  const { isFavourite } = useLibrary();
  const { saveAll } = useRecordingActions();
  const params = useLocalSearchParams<{ favourites?: string; q?: string }>();
  const [limit, setLimit] = useState(400);
  const {
    results, total, filters, setFilters, resetFilters, categories, locations, years, activeFilterCount,
  } = useLectures({ maharaj: active, isDownloaded, isFavourite, limit });

  useEffect(() => {
    if (params.favourites === '1') setFilters((f) => ({ ...f, favouritesOnly: true }));
    if (params.q) setFilters((f) => ({ ...f, query: String(params.q) }));
  }, [params.favourites, params.q, setFilters]);

  useEffect(() => setLimit(400), [filters, active]);

  const yearOptions = [{ value: 0, label: 'Any year' }, ...years.map((y) => ({ value: y, label: String(y) }))];
  const placeOptions = [{ value: '', label: 'Any place' }, ...locations.map((l) => ({ value: l, label: l }))];

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
      {/* ---------------- filter rail ---------------- */}
      <ScrollView
        style={{ width: 260, flexGrow: 0, borderRightWidth: 1, borderRightColor: t.border }}
        contentContainerStyle={{ padding: 18, gap: 4 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '800' }}>Filters</Text>
          {activeFilterCount > 0 ? <Button size="sm" variant="ghost" label="Reset" onPress={resetFilters} /> : null}
        </View>

        <RailLabel text="Sort" />
        <Select label="Sort" value={filters.sort} options={SORTS} onChange={(sort) => setFilters((f) => ({ ...f, sort }))} width="100%" />

        <RailLabel text="Show only" />
        <Toggle label="Downloaded" icon="cloud-done-outline" on={filters.downloadedOnly} color={t.success} onPress={() => setFilters((f) => ({ ...f, downloadedOnly: !f.downloadedOnly }))} />
        <Toggle label="Favourites" icon="heart-outline" on={filters.favouritesOnly} color={t.danger} onPress={() => setFilters((f) => ({ ...f, favouritesOnly: !f.favouritesOnly }))} />

        <RailLabel text="Year" />
        <Select
          label="Year"
          value={filters.yearFrom && filters.yearFrom === filters.yearTo ? filters.yearFrom : 0}
          options={yearOptions}
          onChange={(y) => setFilters((f) => ({ ...f, yearFrom: y || null, yearTo: y || null }))}
          width="100%"
        />
        <RailLabel text="Place" />
        <Select label="Place" value={filters.location} options={placeOptions} onChange={(location) => setFilters((f) => ({ ...f, location }))} width="100%" />

        <RailLabel text="Category" />
        {[{ key: 'All', count: categories.reduce((s, c) => s + c.count, 0) }, ...categories].map((c) => {
          const on = filters.category === c.key;
          const meta = c.key === 'All' ? null : getCategoryMeta(c.key);
          const color = meta?.color ?? maharaj.accent;
          return (
            <Hover
              key={c.key}
              onPress={() => setFilters((f) => ({ ...f, category: c.key }))}
              accessibilityLabel={meta?.label ?? 'All categories'}
              style={({ hovered }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10, height: 34, paddingHorizontal: 10, borderRadius: 8,
                backgroundColor: on ? a(color, 0.15) : hovered ? t.hover : 'transparent',
              } as any)}
            >
              <Ionicons name={(meta?.icon ?? 'apps-outline') as any} size={15} color={on ? t.ink(color) : t.textDim} />
              <Text style={{ flex: 1, color: on ? t.text : t.textSub, fontSize: 13, fontWeight: on ? '700' : '500' }} numberOfLines={1}>
                {meta?.label ?? 'All categories'}
              </Text>
              <Text style={{ color: t.textFaint, fontSize: 11.5, fontVariant: ['tabular-nums'] }}>{c.count.toLocaleString()}</Text>
            </Hover>
          );
        })}
      </ScrollView>

      {/* ---------------- results ---------------- */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <RecordingTable
          rows={results}
          sort={filters.sort}
          onSort={(sort) => setFilters((f) => ({ ...f, sort }))}
          contentStyle={{ paddingHorizontal: 28, paddingBottom: 32 }}
          header={
            <View style={{ paddingTop: 24, paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700' }}>{honoured(maharaj.short)}</Text>
                  <Text style={{ color: t.text, fontSize: 26, fontWeight: '800', marginTop: 2 }}>
                    {filters.favouritesOnly ? 'Favourites' : filters.category !== 'All' ? getCategoryMeta(filters.category).label : 'All lectures'}
                  </Text>
                </View>
                <Button
                  icon="cloud-download-outline"
                  label="Save list"
                  tooltip="Download every recording in this list"
                  onPress={() => saveAll(results)}
                  disabled={!results.length}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}>
                <SearchField
                  value={filters.query}
                  onChange={(query) => setFilters((f) => ({ ...f, query }))}
                  placeholder={`Search ${honoured(maharaj.short)} — title, verse, place, year…`}
                  style={{ flex: 1, maxWidth: 560 }}
                />
                <Text style={{ color: t.textDim, fontSize: 12.5, fontWeight: '600' }}>
                  {total.toLocaleString()} {total === 1 ? 'recording' : 'recordings'}
                  {results.length < total ? ` · showing ${results.length.toLocaleString()}` : ''}
                </Text>
              </View>
            </View>
          }
          footer={
            results.length < total ? (
              <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                <Button label={`Show ${Math.min(400, total - results.length)} more`} onPress={() => setLimit((l) => l + 400)} />
              </View>
            ) : null
          }
          empty={
            <Empty
              icon="search-outline"
              title="No recordings match"
              text="Try fewer words, or clear the filters."
              action={activeFilterCount > 0 ? <Button label="Clear filters" onPress={resetFilters} /> : undefined}
            />
          }
        />
      </View>
    </View>
  );
}

function RailLabel({ text }: { text: string }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 7 }}>
      {text}
    </Text>
  );
}

function Toggle({ label, icon, on, color, onPress }: { label: string; icon: any; on: boolean; color: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Hover
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, height: 34, paddingHorizontal: 10, borderRadius: 8,
        backgroundColor: on ? a(color, 0.14) : hovered ? t.hover : 'transparent',
      } as any)}
    >
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={17} color={on ? color : t.textDim} />
      <Text style={{ flex: 1, color: on ? t.text : t.textSub, fontSize: 13, fontWeight: on ? '700' : '500' }}>{label}</Text>
      <Ionicons name={icon} size={15} color={on ? color : t.textFaint} />
    </Hover>
  );
}
