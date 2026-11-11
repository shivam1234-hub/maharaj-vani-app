import React, { useMemo, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Page from '../../components/desktop/Page';
import { a, useTheme } from '../../components/desktop/theme';
import { Button, Card, Chip, Empty, Equalizer, Hover, IconButton, ProgressBar, Select, useMenu } from '../../components/desktop/kit';
import { useRecordingActions, videoHref } from '../../components/desktop/recordings';
import { HistoryRetention, isVideoEntry, useHistory } from '../../contexts/HistoryContext';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { getRecordingById } from '../../hooks/useLectures';
import { maharajOf, speakerName } from '../../data/maharajas';
import { getCategoryMeta } from '../../data/types';
import { formatMs, formatRelativeTime } from '../../utils/time';

const RETENTIONS: Array<{ value: HistoryRetention; label: string }> = [
  { value: 7, label: 'Keep 7 days' },
  { value: 30, label: 'Keep 30 days' },
  { value: 90, label: 'Keep 90 days' },
  { value: -1, label: 'Keep forever' },
];

/** Desktop History: lectures and videos in one list, grouped by day, with resume. */
export default function HistoryScreen() {
  const t = useTheme();
  const { history, settings, updateSettings, clearHistory } = useHistory();
  const audio = useAudioMeta();
  const { togglePlay, menuFor } = useRecordingActions();
  const { open } = useMenu();
  const [filter, setFilter] = useState<'all' | 'audio' | 'video'>('all');

  const videoCount = useMemo(() => history.filter(isVideoEntry).length, [history]);
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: Array<{ entry: (typeof history)[number]; rec: ReturnType<typeof getRecordingById> }> }> = [];
    const today = new Date();
    const dayKey = (d: Date) => d.toDateString();
    const yesterday = new Date(today.getTime() - 86400000);
    for (const entry of history) {
      if (filter === 'video' && !isVideoEntry(entry)) continue;
      if (filter === 'audio' && isVideoEntry(entry)) continue;
      const d = new Date(entry.playedAt);
      const label = dayKey(d) === dayKey(today) ? 'Today' : dayKey(d) === dayKey(yesterday) ? 'Yesterday'
        : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
      let g = out[out.length - 1];
      if (!g || g.label !== label) { g = { label, items: [] }; out.push(g); }
      g.items.push({ entry, rec: isVideoEntry(entry) ? undefined : getRecordingById(entry.id) });
    }
    return out;
  }, [history, filter]);

  return (
    <Page maxWidth={1200}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 18 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>History</Text>
          <Text style={{ color: t.textDim, fontSize: 13, marginTop: 4 }}>
            {history.length === 0 ? 'Nothing played yet' : `${history.length} ${history.length === 1 ? 'entry' : 'entries'} · every lecture resumes where you stopped`}
          </Text>
        </View>
        <Select label="History retention" value={settings.retention} options={RETENTIONS} onChange={(retention) => updateSettings({ retention })} />
        {history.length > 0 ? (
          <Button
            variant="danger"
            icon="trash-outline"
            label="Clear"
            onPress={() => Alert.alert('Clear history?', 'This removes all listening history and saved positions.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearHistory },
            ])}
          />
        ) : null}
      </View>

      {history.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
          <Chip label="All" count={history.length} on={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Lectures" icon="headset-outline" count={history.length - videoCount} on={filter === 'audio'} onPress={() => setFilter('audio')} />
          <Chip label="Videos" icon="logo-youtube" count={videoCount} on={filter === 'video'} color={t.youtube} onPress={() => setFilter('video')} />
        </View>
      )}

      {history.length === 0 ? (
        <Empty icon="time-outline" title="Nothing played yet" text="Lectures and videos you play show up here, with the point you reached." />
      ) : (
        groups.map((g) => (
          <View key={g.label} style={{ marginBottom: 20 }}>
            <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>{g.label}</Text>
            <Card padding={6}>
              {g.items.map(({ entry, rec }) => {
                const frac = entry.durationMs > 0 ? Math.min(1, entry.positionMs / entry.durationMs) : 0;
                const done = frac > 0.95;
                const video = isVideoEntry(entry);
                const isCur = !video && audio.recording?.id === entry.id;
                const color = video ? t.youtube : maharajOf(rec?.maharaj ?? '')?.accent ?? getCategoryMeta(rec?.category ?? entry.type).color;
                const open1 = () => {
                  if (video) router.push(videoHref({ videoId: entry.videoId!, title: entry.title, channel: entry.channel, thumbnail: entry.thumbnail }, entry.positionMs / 1000) as any);
                  else if (rec) router.push(`/lecture/${rec.id}` as any);
                };
                return (
                  <Hover
                    key={entry.id}
                    onPress={open1}
                    onContextMenu={(e) => rec && open(e.clientX, e.clientY, menuFor(rec))}
                    accessibilityLabel={entry.title}
                    style={({ hovered }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 9,
                      backgroundColor: isCur ? a(t.accent, 0.1) : hovered ? t.hover : 'transparent',
                    } as any)}
                  >
                    {video ? (
                      <View style={{ width: 96, height: 54, borderRadius: 7, overflow: 'hidden', backgroundColor: t.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
                        {entry.thumbnail ? <Image source={{ uri: entry.thumbnail }} style={{ width: '100%', height: '100%' } as any} /> : <Ionicons name="logo-youtube" size={20} color={t.youtube} />}
                      </View>
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: a(color, 0.15), alignItems: 'center', justifyContent: 'center' }}>
                        {isCur && audio.isPlaying ? <Equalizer color={color} playing /> : <Ionicons name={getCategoryMeta(rec?.category ?? entry.type).icon as any} size={19} color={t.ink(color)} />}
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {done ? <Ionicons name="checkmark-done" size={14} color={t.success} /> : null}
                        <Text style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{rec?.title ?? entry.title}</Text>
                      </View>
                      <Text style={{ color: t.textDim, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                        {[
                          video ? entry.channel : rec ? speakerName(rec) : null,
                          formatRelativeTime(entry.playedAt),
                          entry.durationMs > 0 ? `${formatMs(entry.positionMs)} of ${formatMs(entry.durationMs)}` : entry.positionMs > 0 ? `stopped at ${formatMs(entry.positionMs)}` : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                      {frac > 0.01 && !done ? <View style={{ marginTop: 7, maxWidth: 360 }}><ProgressBar frac={frac} color={color} height={3} /></View> : null}
                    </View>
                    {video ? (
                      <IconButton icon="play" label="Resume video" color={t.youtube} onPress={open1} />
                    ) : rec ? (
                      <IconButton icon={isCur && audio.isPlaying ? 'pause' : 'play'} label={isCur && audio.isPlaying ? 'Pause' : 'Resume'} color={t.ink(color)} onPress={() => togglePlay(rec)} />
                    ) : null}
                  </Hover>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </Page>
  );
}
