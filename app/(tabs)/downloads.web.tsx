import React, { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Page from '../../components/desktop/Page';
import { a, useTheme } from '../../components/desktop/theme';
import { Button, Card, Empty, Equalizer, Hover, IconButton, ProgressBar, SearchField, useMenu } from '../../components/desktop/kit';
import { toRequest, useRecordingActions } from '../../components/desktop/recordings';
import { openDownloadsFolder, useDownload } from '../../contexts/DownloadContext.web';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { useHistory } from '../../contexts/HistoryContext';
import { getRecordingById } from '../../hooks/useLectures';
import { maharajOf, honoured, speakerName } from '../../data/maharajas';
import { formatBytes, getCategoryMeta } from '../../data/types';
import { formatRelativeTime } from '../../utils/time';

/** Desktop Downloads: active transfers with progress, then the saved library as a table. */
export default function DownloadsScreen() {
  const t = useTheme();
  const {
    registry, progress, totalBytes, totalCount, queuedCount, deleteDownload, deleteAll, cancelDownload, downloadRecording, getLocalUri,
  } = useDownload();
  const audio = useAudioMeta();
  const { historyMap } = useHistory();
  const { menuFor } = useRecordingActions();
  const { open } = useMenu();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => Object.entries(registry)
    .map(([id, e]) => {
      const rec = getRecordingById(id) ?? null;
      return { id, rec, title: rec?.title ?? e.title ?? id, maharaj: rec?.maharaj ?? e.maharaj, bytes: e.totalBytes, at: e.downloadedAt };
    })
    .filter((r) => !query.trim() || r.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((x, y) => (y.at ?? '').localeCompare(x.at ?? '')), [registry, query]);

  const active = useMemo(() => Object.entries(progress).map(([id, p]) => {
    const rec = getRecordingById(id);
    return { id, p, rec, title: rec?.title ?? id };
  }).sort((x, y) => (x.p.status === 'downloading' ? -1 : 1) - (y.p.status === 'downloading' ? -1 : 1)), [progress]);

  const confirmDeleteAll = () => Alert.alert(
    'Delete all downloads?',
    `This frees ${formatBytes(totalBytes)} and removes ${totalCount} recordings from this computer.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete all', style: 'destructive', onPress: () => deleteAll() }],
  );

  return (
    <Page maxWidth={1300}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginBottom: 22 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>Downloads</Text>
          <Text style={{ color: t.textDim, fontSize: 13, marginTop: 4 }}>
            {totalCount === 0 ? 'Nothing saved yet' : `${totalCount} ${totalCount === 1 ? 'recording' : 'recordings'} · ${formatBytes(totalBytes)} on this computer`}
            {queuedCount > 0 ? ` · ${queuedCount} queued` : ''}
          </Text>
        </View>
        <Button icon="folder-open-outline" label="Open folder" onPress={openDownloadsFolder} tooltip="Show the downloaded MP3s in Explorer" />
        {totalCount > 0 ? <Button variant="danger" icon="trash-outline" label="Delete all" onPress={confirmDeleteAll} /> : null}
      </View>

      {active.length > 0 && (
        <Card padding={8} style={{ marginBottom: 24 }}>
          <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', margin: 10 }}>In progress · {active.length}</Text>
          {active.map(({ id, p, rec, title }) => {
            const frac = p.bytesTotal > 0 ? p.bytesWritten / p.bytesTotal : 0;
            const failed = p.status === 'error';
            return (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: t.border }}>
                <Ionicons name={failed ? 'alert-circle' : p.status === 'queued' ? 'hourglass-outline' : 'arrow-down-circle'} size={20} color={failed ? t.danger : p.status === 'queued' ? t.textDim : t.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    <View style={{ flex: 1, maxWidth: 420 }}>
                      <ProgressBar frac={failed ? 0 : frac} color={failed ? t.danger : t.accent} />
                    </View>
                    <Text style={{ color: failed ? t.danger : t.textDim, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                      {failed ? 'Failed' : p.status === 'queued' ? 'Queued' : p.bytesTotal > 0 ? `${formatBytes(p.bytesWritten)} of ${formatBytes(p.bytesTotal)} · ${Math.round(frac * 100)}%` : 'Starting…'}
                    </Text>
                  </View>
                </View>
                {failed && rec ? <Button size="sm" icon="refresh" label="Retry" onPress={() => downloadRecording(toRequest(rec))} /> : null}
                <IconButton icon="close" label={failed ? 'Dismiss' : 'Cancel'} onPress={() => cancelDownload(id)} />
              </View>
            );
          })}
        </Card>
      )}

      {totalCount === 0 && active.length === 0 ? (
        <Empty
          icon="cloud-download-outline"
          title="No downloads yet"
          text="Use the download button on any lecture — or “Save list” in Browse — to keep it on this computer for offline listening."
          action={<Button variant="primary" icon="library-outline" label="Browse lectures" onPress={() => router.navigate('/browse')} />}
        />
      ) : totalCount > 0 ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '800' }}>Saved</Text>
            <SearchField value={query} onChange={setQuery} placeholder="Filter downloads…" style={{ width: 320 }} />
          </View>
          <Card padding={6}>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
              <Text style={[hdr(t), { width: 44 }]} />
              <Text style={[hdr(t), { flex: 1 }]}>Title</Text>
              <Text style={[hdr(t), { width: 190 }]}>Speaker</Text>
              <Text style={[hdr(t), { width: 110 }]}>Saved</Text>
              <Text style={[hdr(t), { width: 90, textAlign: 'right' }]}>Size</Text>
              <View style={{ width: 80 }} />
            </View>
            {rows.map((r) => {
              const isCur = audio.recording?.id === r.id;
              const playing = isCur && audio.isPlaying;
              const meta = getCategoryMeta(r.rec?.category ?? '');
              const m = r.maharaj ? maharajOf(r.maharaj) : undefined;
              return (
                <Hover
                  key={r.id}
                  onPress={() => r.rec && router.push(`/lecture/${r.rec.id}` as any)}
                  onContextMenu={(e) => r.rec && open(e.clientX, e.clientY, menuFor(r.rec))}
                  accessibilityLabel={r.title}
                  style={({ hovered }) => ({
                    flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: isCur ? a(t.accent, 0.1) : hovered ? t.hover : 'transparent',
                  } as any)}
                >
                  <View style={{ width: 44 }}>
                    {playing ? <Equalizer color={t.accent} playing /> : (
                      <IconButton
                        icon={isCur ? 'play' : 'play-outline'}
                        label="Play"
                        size={30}
                        iconSize={15}
                        disabled={!r.rec}
                        onPress={() => r.rec && (isCur ? audio.resume() : audio.play(r.rec, getLocalUri(r.id), historyMap.get(r.id)?.positionMs ?? 0))}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                    <Text style={{ color: isCur ? t.accentText : t.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{r.title}</Text>
                    <Text style={{ color: t.textDim, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                      {r.rec ? [meta.label, r.rec.location, r.rec.scripture].filter(Boolean).join(' · ') : 'Not in the current catalogue — details unavailable'}
                    </Text>
                  </View>
                  <View style={{ width: 190, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m?.accent ?? t.textFaint }} />
                    <Text style={{ color: t.textSub, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                      {r.rec ? speakerName(r.rec) : m ? honoured(m.short) : '—'}
                    </Text>
                  </View>
                  <Text style={{ width: 110, color: t.textDim, fontSize: 12.5 }}>{r.at ? formatRelativeTime(r.at) : '—'}</Text>
                  <Text style={{ width: 90, color: t.textDim, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatBytes(r.bytes)}</Text>
                  <View style={{ width: 80, alignItems: 'flex-end' }}>
                    <IconButton
                      icon="trash-outline"
                      label="Delete download"
                      color={t.textDim}
                      onPress={() => Alert.alert('Delete download', `Remove the offline copy of “${r.title}”?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(r.id) },
                      ])}
                    />
                  </View>
                </Hover>
              );
            })}
            {rows.length === 0 ? <Text style={{ color: t.textDim, fontSize: 13, padding: 18 }}>No downloads match “{query}”.</Text> : null}
          </Card>
        </>
      ) : null}
    </Page>
  );
}

const hdr = (t: ReturnType<typeof useTheme>) => ({ color: t.textDim, fontSize: 11.5, fontWeight: '800' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const });
