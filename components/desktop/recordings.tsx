/**
 * Recording and video building blocks for the desktop screens (web only):
 * the sortable lecture table with hover play/download and a right-click menu,
 * and the responsive YouTube video grid.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Text, View, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from 'react-native';
import { useAudioMeta } from '../../contexts/AudioContext.web';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useHistory } from '../../contexts/HistoryContext';
import {
  Recording, VideoResult, formatBytes, formatDuration, formatRecordingDate, getCategoryMeta,
} from '../../data/types';
import { maharajOf, speakerName } from '../../data/maharajas';
import { openExternal } from '../../utils/desktopBridge';
import { a, useTheme } from './theme';
import { Badge, Equalizer, Hover, IconButton, ProgressBar, Tip, useMenu, type MenuItem } from './kit';

// ------------------------------------------------------------------ actions

export const toRequest = (r: Recording) => ({
  id: r.id, url: r.url, title: r.title, maharaj: r.maharaj, sizeBytes: r.sizeBytes,
});

export function videoHref(v: { videoId: string; title: string; channel?: string; thumbnail?: string }, startSec?: number) {
  return (
    `/video/${v.videoId}?title=${encodeURIComponent(v.title)}` +
    `&channel=${encodeURIComponent(v.channel ?? '')}` +
    `&thumb=${encodeURIComponent(v.thumbnail ?? '')}` +
    (startSec ? `&start=${Math.floor(startSec)}` : '')
  );
}

/** Play / download / favourite behaviour shared by every list on desktop. */
export function useRecordingActions() {
  const audio = useAudioMeta();
  const dl = useDownload();
  const lib = useLibrary();
  const { historyMap } = useHistory();

  const togglePlay = useCallback((rec: Recording) => {
    if (audio.recording?.id === rec.id) {
      audio.isPlaying ? audio.pause() : audio.resume();
      return;
    }
    audio.play(rec, dl.getLocalUri(rec.id), historyMap.get(rec.id)?.positionMs ?? 0);
  }, [audio, dl, historyMap]);

  const toggleDownload = useCallback((rec: Recording) => {
    const p = dl.progress[rec.id];
    if (p && p.status !== 'error') {
      dl.cancelDownload(rec.id);
      return;
    }
    if (dl.isDownloaded(rec.id)) {
      Alert.alert('Delete download', `Remove the offline copy of “${rec.title}”?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => dl.deleteDownload(rec.id) },
      ]);
      return;
    }
    dl.downloadRecording(toRequest(rec));
  }, [dl]);

  const saveAll = useCallback((list: Recording[], what = 'this list') => {
    const pending = list.filter((r) => !dl.isDownloaded(r.id));
    if (!pending.length) {
      Alert.alert('Nothing to download', `Every recording in ${what} is already saved.`);
      return;
    }
    const bytes = pending.reduce((s, r) => s + r.sizeBytes, 0);
    Alert.alert(
      `Download ${pending.length} recordings?`,
      `This will use about ${(bytes / 1024 ** 3).toFixed(2)} GB of disk space.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => dl.downloadBatch(pending.map(toRequest)) },
      ],
    );
  }, [dl]);

  const menuFor = useCallback((rec: Recording): MenuItem[] => {
    const isCur = audio.recording?.id === rec.id;
    const downloaded = dl.isDownloaded(rec.id);
    const busy = dl.progress[rec.id] && dl.progress[rec.id].status !== 'error';
    const fav = lib.isFavourite(rec.id);
    const resumeAt = historyMap.get(rec.id)?.positionMs ?? 0;
    return [
      { label: isCur && audio.isPlaying ? 'Pause' : resumeAt > 5000 ? 'Resume' : 'Play', icon: isCur && audio.isPlaying ? 'pause' : 'play', onPress: () => togglePlay(rec) },
      ...(resumeAt > 5000 ? [{ label: 'Play from the beginning', icon: 'refresh' as const, onPress: () => audio.play(rec, dl.getLocalUri(rec.id), 0) }] : []),
      { label: 'Open lecture page', icon: 'open-outline', onPress: () => router.push(`/lecture/${rec.id}` as any) },
      { separator: true },
      { label: fav ? 'Remove from favourites' : 'Add to favourites', icon: fav ? 'heart-dislike-outline' : 'heart-outline', onPress: () => lib.toggleFavourite(rec.id) },
      busy
        ? { label: 'Cancel download', icon: 'close-circle-outline', onPress: () => dl.cancelDownload(rec.id) }
        : downloaded
          ? { label: 'Delete download', icon: 'trash-outline', danger: true, onPress: () => toggleDownload(rec) }
          : { label: `Download (${formatBytes(rec.sizeBytes)})`, icon: 'cloud-download-outline', onPress: () => dl.downloadRecording(toRequest(rec)) },
      { separator: true },
      { label: 'View on audio.iskcondesiretree.com', icon: 'globe-outline', onPress: () => openExternal(rec.sourceUrl) },
    ];
  }, [audio, dl, lib, historyMap, togglePlay, toggleDownload]);

  return { togglePlay, toggleDownload, saveAll, menuFor };
}

// ------------------------------------------------------------------ table

export type SortKey = 'relevance' | 'newest' | 'oldest' | 'title' | 'longest';

interface TableProps {
  rows: Recording[];
  sort?: SortKey;
  onSort?: (s: SortKey) => void;
  showSpeaker?: boolean;
  hideCategory?: boolean;
  hideFolder?: boolean;
  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  empty?: React.ReactElement | null;
  contentStyle?: StyleProp<ViewStyle>;
  /** Fixed-height rows for fast virtualised scrolling. */
  dense?: boolean;
}

const ROW_H = 58;

/** Which optional columns fit, given the table's own measured width (title keeps ≥ ~360px). */
function fitColumns(w: number, opts: { speaker?: boolean; category?: boolean }) {
  let avail = (w || 900) - 44 - 104 - 84 - 118 - 24;
  const speaker = Boolean(opts.speaker) && avail - 170 >= 380;
  if (speaker) avail -= 170;
  const category = opts.category !== false && avail - 140 >= 400;
  if (category) avail -= 140;
  const place = avail - 140 >= 440;
  return { speaker, category, place };
}

export function RecordingTable({
  rows, sort, onSort, showSpeaker, hideCategory, hideFolder, header, footer, empty, contentStyle,
}: TableProps) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const cols = fitColumns(w - 56, { speaker: showSpeaker, category: !hideCategory });

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 36, borderBottomWidth: 1, borderBottomColor: t.border, paddingHorizontal: 8, marginBottom: 4 }}>
      <Text style={[colStyle.idx, { color: t.textFaint, fontSize: 11.5, fontWeight: '700', textAlign: 'center' }]}>#</Text>
      <HeadCell label="Title" k="title" sort={sort} onSort={onSort} flex />
      {cols.speaker && <HeadCell label="Speaker" width={170} />}
      {cols.category && <HeadCell label="Category" width={140} />}
      <HeadCell label="Date" k={sort === 'newest' ? 'oldest' : 'newest'} active={sort === 'newest' || sort === 'oldest'} dir={sort === 'oldest' ? 'up' : 'down'} sort={sort} onSort={onSort} width={118} />
      {cols.place && <HeadCell label="Place" width={140} />}
      <HeadCell label="Size" k="longest" sort={sort} onSort={onSort} width={84} right />
      <View style={{ width: 104 }} />
    </View>
  );

  return (
    <FlatList
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      data={rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <>
          {header}
          {rows.length > 0 ? head : null}
        </>
      }
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      contentContainerStyle={contentStyle}
      initialNumToRender={24}
      maxToRenderPerBatch={30}
      windowSize={11}
      renderItem={({ item, index }) => (
        <RecordingRow rec={item} index={index} cols={cols} hideFolder={hideFolder} />
      )}
    />
  );
}

const colStyle = { idx: { width: 44 } } as const;

/** Non-virtualised rows for short lists inside a scrolling page. */
export function RecordingList({ rows, showSpeaker, hideFolder }: { rows: Recording[]; showSpeaker?: boolean; hideFolder?: boolean }) {
  const [w, setW] = useState(0);
  const cols = fitColumns(w, { speaker: showSpeaker });
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {rows.map((r, i) => <RecordingRow key={r.id} rec={r} index={i} cols={cols} hideFolder={hideFolder} />)}
    </View>
  );
}

function HeadCell({
  label, k, sort, onSort, width, flex, right, active, dir,
}: {
  label: string; k?: SortKey; sort?: SortKey; onSort?: (s: SortKey) => void;
  width?: number; flex?: boolean; right?: boolean; active?: boolean; dir?: 'up' | 'down';
}) {
  const t = useTheme();
  const on = active ?? (k != null && sort === k);
  const sortable = Boolean(k && onSort);
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: right ? 'flex-end' : 'flex-start' }}>
      <Text style={{ color: on ? t.text : t.textDim, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      {on ? <Ionicons name={dir === 'up' ? 'arrow-up' : 'arrow-down'} size={12} color={t.accentText} /> : null}
    </View>
  );
  const box = { width, flex: flex ? 1 : undefined, paddingHorizontal: 8 } as any;
  if (!sortable) return <View style={box}>{inner}</View>;
  return (
    <View style={box}>
      <Tip label={`Sort by ${label.toLowerCase()}`}>
        <Hover onPress={() => onSort!(k!)} style={({ hovered }) => ({ opacity: hovered ? 0.8 : 1, alignSelf: right ? 'flex-end' : 'flex-start' })}>
          {inner}
        </Hover>
      </Tip>
    </View>
  );
}

const RecordingRow = React.memo(function RecordingRow({
  rec, index, cols, hideFolder,
}: {
  rec: Recording; index: number; cols: { place: boolean; category: boolean; speaker: boolean }; hideFolder?: boolean;
}) {
  const t = useTheme();
  const audio = useAudioMeta();
  const { isDownloaded, progress } = useDownload();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { historyMap } = useHistory();
  const { togglePlay, toggleDownload, menuFor } = useRecordingActions();
  const { open } = useMenu();
  const meta = getCategoryMeta(rec.category);
  const m = maharajOf(rec.maharaj);
  const isCur = audio.recording?.id === rec.id;
  const playing = isCur && audio.isPlaying;
  const p = progress[rec.id];
  const busy = p != null && p.status !== 'error';
  const failed = p?.status === 'error';
  const downloaded = isDownloaded(rec.id);
  const fav = isFavourite(rec.id);
  const h = historyMap.get(rec.id);
  const frac = h && h.durationMs > 0 ? Math.min(1, h.positionMs / h.durationMs) : 0;

  return (
    <Hover
      onPress={() => router.push(`/lecture/${rec.id}` as any)}
      onContextMenu={(e) => open(e.clientX, e.clientY, menuFor(rec))}
      accessibilityLabel={rec.title}
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', height: ROW_H, paddingHorizontal: 8, borderRadius: 8,
        backgroundColor: isCur ? a(t.accent, t.dark ? 0.1 : 0.08) : hovered ? t.hover : 'transparent',
      } as any)}
    >
      {({ hovered }) => (
        <>
          <View style={[colStyle.idx, { alignItems: 'center', justifyContent: 'center' }]}>
            {hovered || isCur ? (
              <IconButton
                icon={playing ? 'pause' : 'play'}
                label={playing ? 'Pause' : frac > 0.02 && frac < 0.95 ? 'Resume' : 'Play'}
                size={30}
                iconSize={15}
                color={isCur ? t.accentText : t.text}
                onPress={() => togglePlay(rec)}
              />
            ) : (
              <Text style={{ color: t.textFaint, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>{index + 1}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              {playing ? <Equalizer color={t.accent} playing size={12} /> : null}
              {frac > 0.95 ? (
                <Tip label="Listened"><Ionicons name="checkmark-done" size={14} color={t.success} /></Tip>
              ) : null}
              <Text style={{ flex: 1, color: isCur ? t.accentText : t.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
                {rec.title}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              {!cols.category && <Badge text={meta.badge} color={meta.color} />}
              {!hideFolder && rec.breadcrumb.length > 0 ? (
                <Text style={{ flex: 1, color: t.textDim, fontSize: 11.5 }} numberOfLines={1}>{rec.breadcrumb.join(' › ')}</Text>
              ) : rec.scripture ? (
                <Text style={{ color: t.textDim, fontSize: 11.5 }}>{rec.scripture}</Text>
              ) : null}
              {frac > 0.02 && frac <= 0.95 ? (
                <View style={{ width: 60 }}><ProgressBar frac={frac} color={meta.color} height={3} /></View>
              ) : null}
            </View>
          </View>
          {cols.speaker && (
            <View style={{ width: 170, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m?.accent ?? t.textFaint }} />
              <Text style={{ flex: 1, color: t.textSub, fontSize: 12.5 }} numberOfLines={1}>{speakerName(rec)}</Text>
            </View>
          )}
          {cols.category && (
            <View style={{ width: 140, paddingHorizontal: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={meta.icon as any} size={13} color={t.ink(meta.color)} />
                <Text style={{ color: t.textSub, fontSize: 12.5 }} numberOfLines={1}>{meta.label}</Text>
              </View>
            </View>
          )}
          <Text style={{ width: 118, paddingHorizontal: 8, color: t.textSub, fontSize: 12.5, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {rec.date ? formatRecordingDate(rec.date) : rec.year ?? '—'}
          </Text>
          {cols.place && (
            <Text style={{ width: 140, paddingHorizontal: 8, color: t.textSub, fontSize: 12.5 }} numberOfLines={1}>
              {rec.location ?? '—'}
            </Text>
          )}
          <Text style={{ width: 84, paddingHorizontal: 8, color: t.textDim, fontSize: 12.5, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {formatBytes(rec.sizeBytes)}
          </Text>
          <View style={{ width: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
            {hovered || fav ? (
              <IconButton
                icon={fav ? 'heart' : 'heart-outline'}
                label={fav ? 'Remove from favourites' : 'Add to favourites'}
                color={fav ? t.danger : t.textDim}
                size={30}
                iconSize={16}
                onPress={() => toggleFavourite(rec.id)}
              />
            ) : <View style={{ width: 30 }} />}
            <DownloadButton busy={busy} failed={failed} downloaded={downloaded} frac={p && p.bytesTotal ? p.bytesWritten / p.bytesTotal : 0} queued={p?.status === 'queued'} visible={hovered} onPress={() => toggleDownload(rec)} />
            {hovered ? (
              <div onClick={(e) => { e.stopPropagation(); open(e.clientX - 230, e.clientY + 10, menuFor(rec)); }}>
                <IconButton icon="ellipsis-horizontal" label="More" size={30} iconSize={16} />
              </div>
            ) : <View style={{ width: 30 }} />}
          </View>
        </>
      )}
    </Hover>
  );
});

export function DownloadButton({
  busy, failed, downloaded, frac, queued, visible = true, onPress, size = 30,
}: { busy: boolean; failed: boolean; downloaded: boolean; frac: number; queued?: boolean; visible?: boolean; onPress: () => void; size?: number }) {
  const t = useTheme();
  if (busy) {
    return (
      <Tip label={queued ? 'Queued — click to cancel' : `Downloading ${Math.round(frac * 100)}% — click to cancel`}>
        <Hover onPress={onPress} accessibilityLabel="Cancel download" style={() => ({ width: size, height: size, alignItems: 'center', justifyContent: 'center' })}>
          {queued ? <Ionicons name="hourglass-outline" size={15} color={t.textDim} /> : <ProgressRing frac={frac} color={t.accent} size={18} track={t.border} />}
        </Hover>
      </Tip>
    );
  }
  if (downloaded) {
    return <IconButton icon="checkmark-circle" label="Downloaded — click to delete" color={t.success} size={size} iconSize={17} onPress={onPress} />;
  }
  if (failed) {
    return <IconButton icon="alert-circle" label="Download failed — click to retry" color={t.danger} size={size} iconSize={17} onPress={onPress} />;
  }
  if (!visible) return <View style={{ width: size }} />;
  return <IconButton icon="arrow-down-circle-outline" label="Download for offline listening" size={size} iconSize={17} onPress={onPress} />;
}

export function ProgressRing({ frac, color, size, track }: { frac: number; color: string; size: number; track: string }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={2.5} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={2.5} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.03, Math.min(1, frac)))} strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ videos

export function VideoTile({
  video, width, badge, onPress,
}: { video: VideoResult; width: number; badge?: string; onPress?: () => void }) {
  const t = useTheme();
  const { historyMap } = useHistory();
  const watched = historyMap.get(`yt:${video.videoId}`);
  const frac = watched && watched.durationMs > 0 ? Math.min(1, watched.positionMs / watched.durationMs) : 0;
  return (
    <Hover
      onPress={onPress ?? (() => router.push(videoHref(video) as any))}
      accessibilityLabel={video.title}
      style={() => ({ width })}
    >
      {({ hovered }) => (
        <View>
          <View
            style={{
              width, height: Math.round((width * 9) / 16), borderRadius: 12, overflow: 'hidden',
              backgroundColor: t.surfaceHi, borderWidth: 1, borderColor: hovered ? t.borderHi : t.border,
              transform: [{ translateY: hovered ? -2 : 0 }], transitionDuration: '150ms',
              boxShadow: hovered ? t.shadow : 'none',
            } as any}
          >
            {video.thumbnail ? (
              <Image source={{ uri: video.thumbnail }} style={{ width: '100%', height: '100%' } as any} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="logo-youtube" size={30} color={t.youtube} />
              </View>
            )}
            {video.durationSec != null ? (
              <View style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: '#000000cc', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '700' }}>{formatDuration(video.durationSec)}</Text>
              </View>
            ) : null}
            {badge ? (
              <View style={{ position: 'absolute', left: 8, top: 8, backgroundColor: '#000000b3', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{badge}</Text>
              </View>
            ) : null}
            {hovered ? (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000033' } as any}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
                </View>
              </View>
            ) : null}
            {frac > 0.02 ? (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#ffffff40' }}>
                <View style={{ height: 3, width: `${frac * 100}%`, backgroundColor: t.youtube }} />
              </View>
            ) : null}
          </View>
          <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700', lineHeight: 18, marginTop: 9 }} numberOfLines={2}>
            {video.title}
          </Text>
          <Text style={{ color: t.textDim, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {[video.channel, video.viewsText, video.publishedText].filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}
    </Hover>
  );
}

/** Responsive grid: as many columns of at least `minWidth` as fit. */
export function VideoGrid({
  videos, minWidth = 250, gap = 20, max, badgeFor,
}: { videos: VideoResult[]; minWidth?: number; gap?: number; max?: number; badgeFor?: (v: VideoResult) => string | undefined }) {
  const [w, setW] = useState(0);
  const cols = Math.max(1, Math.floor((w + gap) / (minWidth + gap)));
  const tile = w > 0 ? Math.floor((w - gap * (cols - 1)) / cols) : minWidth;
  const shown = max ? videos.slice(0, max) : videos;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: gap + 6 } as any}>
      {w > 0 && shown.map((v) => <VideoTile key={v.videoId} video={v} width={tile} badge={badgeFor?.(v)} />)}
    </View>
  );
}

/** How many columns a grid of `minWidth` tiles gets, for "show one row" logic. */
export function useGridColumns(minWidth: number, gap = 20) {
  const [w, setW] = useState(0);
  const cols = Math.max(1, Math.floor((w + gap) / (minWidth + gap)));
  return { cols, onLayout: (e: any) => setW(e.nativeEvent.layout.width), ready: w > 0 };
}

export function LoadingInline({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 }}>
      <ActivityIndicator color={t.accent} size="small" />
      <Text style={{ color: t.textDim, fontSize: 12.5 }}>{label}</Text>
    </View>
  );
}

