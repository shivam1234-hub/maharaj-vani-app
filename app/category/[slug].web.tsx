import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { a, useTheme } from '../../components/desktop/theme';
import { Button, Empty, Hover, SearchField } from '../../components/desktop/kit';
import { RecordingTable, useRecordingActions, type SortKey } from '../../components/desktop/recordings';
import { useMaharaj } from '../../contexts/MaharajContext';
import { getCatalog } from '../../hooks/useLectures';
import { formatBytes, getCategoryMeta } from '../../data/types';
import { honoured } from '../../data/maharajas';

/**
 * Desktop category: the series inside it (the archive's sub-folders) as a
 * folder pane on the left, the recordings as a sortable table on the right.
 */
export default function CategoryScreen() {
  const t = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { active, maharaj } = useMaharaj();
  const { saveAll } = useRecordingActions();
  const category = String(slug ?? '');
  const meta = getCategoryMeta(category);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [folder, setFolder] = useState<string | null>(null);

  const all = useMemo(() => getCatalog(active).filter((r) => r.category === category), [active, category]);
  const folders = useMemo(() => {
    const counts = new Map<string, { count: number; bytes: number }>();
    for (const r of all) {
      if (!r.folder) continue;
      const c = counts.get(r.folder) ?? { count: 0, bytes: 0 };
      c.count++;
      c.bytes += r.sizeBytes;
      counts.set(r.folder, c);
    }
    return [...counts.entries()].map(([key, v]) => ({ key, ...v })).sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true }));
  }, [all]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = all.filter((r) => {
      if (folder && r.folder !== folder) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q) ||
        (r.scripture ?? '').toLowerCase().includes(q) ||
        String(r.year ?? '').includes(q)
      );
    });
    if (sort === 'newest') out.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
    else if (sort === 'oldest') out.sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''));
    else if (sort === 'longest') out.sort((x, y) => y.sizeBytes - x.sizeBytes);
    else out.sort((x, y) => x.title.localeCompare(y.title, undefined, { numeric: true }));
    return out;
  }, [all, query, sort, folder]);

  const totalBytes = useMemo(() => all.reduce((s, r) => s + r.sizeBytes, 0), [all]);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
      {folders.length > 1 && (
        <ScrollView style={{ width: 280, flexGrow: 0, borderRightWidth: 1, borderRightColor: t.border }} contentContainerStyle={{ padding: 14 }}>
          <Text style={{ color: t.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', margin: 6, marginBottom: 10 }}>
            Series · {folders.length}
          </Text>
          {[{ key: '', count: all.length, bytes: totalBytes }, ...folders].map((f) => {
            const on = f.key ? folder === f.key : folder === null;
            return (
              <Hover
                key={f.key || 'all'}
                onPress={() => setFolder(f.key || null)}
                accessibilityLabel={f.key || 'All series'}
                style={({ hovered }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
                  backgroundColor: on ? a(meta.color, 0.15) : hovered ? t.hover : 'transparent',
                } as any)}
              >
                <Ionicons name={on ? 'folder-open' : 'folder-outline'} size={16} color={on ? t.ink(meta.color) : t.textDim} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: on ? t.text : t.textSub, fontSize: 13, fontWeight: on ? '700' : '500' }} numberOfLines={2}>
                    {f.key || 'All series'}
                  </Text>
                  <Text style={{ color: t.textFaint, fontSize: 11, marginTop: 1 }}>
                    {f.count.toLocaleString()} · {formatBytes(f.bytes)}
                  </Text>
                </View>
              </Hover>
            );
          })}
        </ScrollView>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <RecordingTable
          rows={results}
          sort={sort}
          onSort={setSort}
          hideCategory
          hideFolder={Boolean(folder)}
          contentStyle={{ paddingHorizontal: 28, paddingBottom: 32 }}
          header={
            <View style={{ paddingTop: 24, paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: a(meta.color, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={meta.icon as any} size={26} color={t.ink(meta.color)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700' }}>{honoured(maharaj.short)} · Category</Text>
                  <Text style={{ color: t.text, fontSize: 26, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                    {folder ?? meta.label}
                  </Text>
                  <Text style={{ color: t.textDim, fontSize: 12.5, marginTop: 3 }}>
                    {results.length.toLocaleString()} of {all.length.toLocaleString()} recordings · {formatBytes(totalBytes)}
                  </Text>
                </View>
                <Button icon="cloud-download-outline" label={folder ? 'Save series' : 'Save all'} onPress={() => saveAll(results, folder ? 'this series' : 'this category')} disabled={!results.length} />
              </View>
              <SearchField value={query} onChange={setQuery} placeholder={`Search in ${folder ?? meta.label}…`} style={{ marginTop: 18, maxWidth: 560 }} />
            </View>
          }
          empty={<Empty icon="albums-outline" title="Nothing here" text="Try clearing the search or picking another series." />}
        />
      </View>
    </View>
  );
}
