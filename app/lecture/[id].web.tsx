import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaharajAvatar from '../../components/MaharajAvatar';
import { a, useTheme } from '../../components/desktop/theme';
import { Button, Card, Empty, Equalizer, Hover, IconButton, Kicker, Range, Tip, useMenu } from '../../components/desktop/kit';
import { DownloadButton, useRecordingActions } from '../../components/desktop/recordings';
import { SPEEDS, useAudio } from '../../contexts/AudioContext.web';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getCatalog, getRecordingById } from '../../hooks/useLectures';
import { maharajOf, speakerName } from '../../data/maharajas';
import { formatBytes, formatRecordingDate, getCategoryMeta } from '../../data/types';
import { parseVerseRefs } from '../../utils/verseRef';
import { getChapter } from '../../data/verseIndex';
import { entryEnd, entryStart } from '../../utils/verseRef';
import { formatMs } from '../../utils/time';
import { openExternal } from '../../utils/desktopBridge';

const PRESET_TAGS = ['To hear again', 'Favourite class', 'Share', 'Study'];

/**
 * Desktop lecture page — the full player. Two panes: the lecture's details
 * and transport on the left; the queue and the rest of its series on the right.
 */
export default function LectureScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const audio = useAudio();
  const { isDownloaded, progress, getLocalUri } = useDownload();
  const { isFavourite, toggleFavourite, getTagsFor, addTag, removeTag, allTags } = useLibrary();
  const { historyMap } = useHistory();
  const { readerFontScale, increaseReaderFontSize, decreaseReaderFontSize } = useSettings();
  const { togglePlay, toggleDownload } = useRecordingActions();
  const { open } = useMenu();
  const [newTag, setNewTag] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const seriesRef = useRef<ScrollView>(null);

  const recording = useMemo(() => (id ? getRecordingById(String(id)) : undefined), [id]);
  const maharaj = recording ? maharajOf(recording.maharaj) : undefined;
  const related = useMemo(
    () => (recording && maharaj
      ? getCatalog(maharaj.key)
        .filter((r) => r.folder === recording.folder)
        .sort((x, y) => (x.date ?? '').localeCompare(y.date ?? '') || x.title.localeCompare(y.title, undefined, { numeric: true }))
      : []),
    [recording, maharaj],
  );

  // The verse this class is on, so "Open verse" can jump into the Verses pane.
  const verseHrefFor = useMemo(() => {
    if (!recording?.scripture) return null;
    const ref = parseVerseRefs(recording.scripture)[0];
    if (!ref) return null;
    const ch = getChapter(ref.book, ref.part, ref.chapter);
    if (!ch) return null;
    const entry = ref.from != null ? ch.verses.find((e) => ref.from! >= entryStart(e) && ref.from! <= entryEnd(e)) : undefined;
    return `/verses?book=${ref.book}&part=${encodeURIComponent(ref.part)}&n=${ref.chapter}${entry ? `&entry=${encodeURIComponent(entry)}` : ''}`;
  }, [recording]);

  if (!recording) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, justifyContent: 'center' }}>
        <Empty icon="help-circle-outline" title="Recording not found" text="It may have been removed from the catalogue." action={<Button label="Go back" onPress={() => router.back()} />} />
      </View>
    );
  }

  const meta = getCategoryMeta(recording.category);
  const accent = maharaj?.accent ?? meta.color;
  const isCur = audio.recording?.id === recording.id;
  const played = historyMap.get(recording.id);
  const position = drag ?? (isCur ? audio.positionMs : played?.positionMs ?? 0);
  const duration = isCur ? audio.durationMs : played?.durationMs ?? 0;
  const fav = isFavourite(recording.id);
  const tags = getTagsFor(recording.id);
  const p = progress[recording.id];
  const fs = (n: number) => Math.round(n * readerFontScale);
  const twoPane = width >= 1180;

  const seekTo = (ms: number) => {
    if (isCur) audio.seek(ms);
    else audio.play(recording, getLocalUri(recording.id), ms);
  };

  const tagChoices = [...PRESET_TAGS, ...allTags].filter((x, i, arr) => arr.indexOf(x) === i && !tags.includes(x));

  const left = (
    <View style={{ flex: 1, minWidth: 0, gap: 18 }}>
      {/* ---------------- hero ---------------- */}
      <View
        style={{
          borderRadius: 20, borderWidth: 1, borderColor: a(accent, 0.35), padding: 26, overflow: 'hidden',
          backgroundImage: `linear-gradient(135deg, ${a(accent, t.dark ? 0.24 : 0.16)}, ${a(accent, 0.03)} 70%)`,
          backgroundColor: t.surface,
        } as any}
      >
        <View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}>
          {maharaj ? (
            <MaharajAvatar maharaj={maharaj} size={104} />
          ) : (
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: a(accent, 0.18), alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mic" size={40} color={accent} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: a(meta.color, 0.16) }}>
                <Ionicons name={meta.icon as any} size={12} color={t.ink(meta.color)} />
                <Text style={{ color: t.ink(meta.color), fontSize: 11.5, fontWeight: '800' }}>{meta.label}</Text>
              </View>
              {isDownloaded(recording.id) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: a(t.success, 0.14) }}>
                  <Ionicons name="cloud-done" size={12} color={t.success} />
                  <Text style={{ color: t.success, fontSize: 11.5, fontWeight: '800' }}>Offline</Text>
                </View>
              ) : null}
            </View>
            <Text selectable style={{ color: t.text, fontSize: fs(24), lineHeight: fs(31), fontWeight: '800', marginTop: 10 }}>
              {recording.title}
            </Text>
            <Text style={{ color: t.ink(accent), fontSize: fs(14), fontWeight: '700', marginTop: 6 }}>
              {maharaj?.name ?? speakerName(recording)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 20 }}>
          {recording.date || recording.year ? <Meta icon="calendar-outline" text={recording.date ? formatRecordingDate(recording.date) : String(recording.year)} fs={fs} /> : null}
          {recording.location ? <Meta icon="location-outline" text={recording.location} fs={fs} /> : null}
          {recording.scripture ? <Meta icon="book-outline" text={recording.scripture} fs={fs} /> : null}
          <Meta icon="musical-note-outline" text={`${formatBytes(recording.sizeBytes)} · ${recording.format}`} fs={fs} />
        </View>
        {recording.breadcrumb.length > 0 ? (
          <Text style={{ color: t.textDim, fontSize: fs(12), marginTop: 10 }} selectable>{recording.breadcrumb.join(' › ')}</Text>
        ) : null}
      </View>

      {/* ---------------- player ---------------- */}
      <Card padding={22}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: t.textDim, fontSize: 12, width: 56, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatMs(position)}</Text>
          <View style={{ flex: 1 }}>
            <Range
              label="Seek"
              value={position}
              max={duration}
              color={accent}
              rest={t.dark ? '#ffffff22' : '#0000001a'}
              onChange={(v) => setDrag(v)}
              onCommit={(v) => { seekTo(v); setDrag(null); }}
            />
          </View>
          <Text style={{ color: t.textDim, fontSize: 12, width: 56, fontVariant: ['tabular-nums'] }}>{duration > 0 ? formatMs(duration) : '–:––'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
          {[-60, -15].map((s) => (
            <Button key={s} size="sm" variant="ghost" label={`${s}s`} disabled={!isCur} onPress={() => audio.seek(Math.max(0, position + s * 1000))} tooltip={`Back ${-s} seconds`} />
          ))}
          <Tip label={isCur && audio.isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
            <Hover
              onPress={() => togglePlay(recording)}
              accessibilityLabel="Play or pause"
              style={({ hovered, pressed }) => ({
                width: 64, height: 64, borderRadius: 32, backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
                transform: [{ scale: pressed ? 0.95 : hovered ? 1.05 : 1 }], transitionDuration: '120ms', marginHorizontal: 8,
                boxShadow: `0 8px 24px ${a(accent, 0.4)}`,
              } as any)}
            >
              {isCur && audio.isLoading && audio.isPlaying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name={isCur && audio.isPlaying ? 'pause' : 'play'} size={28} color="#fff" style={isCur && audio.isPlaying ? undefined : { marginLeft: 3 }} />
              )}
            </Hover>
          </Tip>
          {[15, 60].map((s) => (
            <Button key={s} size="sm" variant="ghost" label={`+${s}s`} disabled={!isCur} onPress={() => audio.seek(position + s * 1000)} tooltip={`Forward ${s} seconds`} />
          ))}
        </View>
        {isCur && audio.error ? <Text style={{ color: t.danger, fontSize: 12.5, textAlign: 'center', marginTop: 10 }}>{audio.error}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
          <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700', marginRight: 4 }}>Speed</Text>
          {SPEEDS.map((s) => {
            const on = audio.speed === s;
            return (
              <Hover
                key={s}
                onPress={() => audio.setSpeed(s)}
                accessibilityLabel={`${s}×`}
                style={({ hovered }) => ({
                  height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center', borderWidth: 1,
                  borderColor: on ? accent : t.border, backgroundColor: on ? a(accent, 0.15) : hovered ? t.hover : 'transparent',
                } as any)}
              >
                <Text style={{ color: on ? t.ink(accent) : t.textSub, fontSize: 12, fontWeight: on ? '800' : '600' }}>{s}×</Text>
              </Hover>
            );
          })}
        </View>
        <Text style={{ color: t.textFaint, fontSize: 11.5, textAlign: 'center', marginTop: 12 }}>
          {isCur
            ? audio.offline ? 'Playing the downloaded copy' : 'Streaming from the archive'
            : played?.positionMs ? `You stopped at ${formatMs(played.positionMs)} — play to resume` : 'Not started'}
        </Text>
      </Card>

      {/* ---------------- actions ---------------- */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          icon={fav ? 'heart' : 'heart-outline'}
          label={fav ? 'Favourite' : 'Add to favourites'}
          color={t.danger}
          variant={fav ? 'tint' : 'secondary'}
          onPress={() => toggleFavourite(recording.id)}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 6, paddingRight: 14, borderRadius: 18, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
          <DownloadButton
            busy={p != null && p.status !== 'error'}
            failed={p?.status === 'error'}
            downloaded={isDownloaded(recording.id)}
            frac={p && p.bytesTotal ? p.bytesWritten / p.bytesTotal : 0}
            queued={p?.status === 'queued'}
            onPress={() => toggleDownload(recording)}
          />
          <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700' }}>
            {p && p.status !== 'error'
              ? p.status === 'queued' ? 'Queued' : p.bytesTotal > 0 ? `Downloading ${Math.round((p.bytesWritten / p.bytesTotal) * 100)}%` : 'Starting…'
              : isDownloaded(recording.id) ? 'Downloaded' : p?.status === 'error' ? 'Retry download' : `Download · ${formatBytes(recording.sizeBytes)}`}
          </Text>
        </View>
        {verseHrefFor ? <Button icon="book-outline" label={`Open ${recording.scripture}`} onPress={() => router.navigate(verseHrefFor as any)} /> : null}
        <Button icon="globe-outline" label="Website" tooltip="Open the folder on audio.iskcondesiretree.com" onPress={() => openExternal(recording.sourceUrl)} />
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 18, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, paddingHorizontal: 2 }}>
          <IconButton icon="remove" label="Smaller text" size={30} iconSize={15} onPress={decreaseReaderFontSize} />
          <Ionicons name="text" size={15} color={t.textDim} />
          <IconButton icon="add" label="Larger text" size={30} iconSize={15} onPress={increaseReaderFontSize} />
        </View>
      </View>

      {/* ---------------- tags ---------------- */}
      <Card padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Ionicons name="pricetags-outline" size={16} color={t.textSub} />
          <Text style={{ color: t.text, fontSize: 13.5, fontWeight: '700', marginRight: 6 }}>Tags</Text>
          {tags.map((tag) => (
            <Hover
              key={tag}
              onPress={() => removeTag(recording.id, tag)}
              accessibilityLabel={`Remove tag ${tag}`}
              style={({ hovered }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14,
                backgroundColor: a(accent, hovered ? 0.25 : 0.15),
              } as any)}
            >
              <Text style={{ color: t.ink(accent), fontSize: 12.5, fontWeight: '700' }}>{tag}</Text>
              <Ionicons name="close" size={12} color={t.ink(accent)} />
            </Hover>
          ))}
          <div
            onClick={(e) => {
              open(e.clientX, e.clientY + 12, [
                ...tagChoices.slice(0, 12).map((x) => ({ label: x, icon: 'add' as const, onPress: () => addTag(recording.id, x) })),
              ]);
            }}
          >
            <Button size="sm" icon="add" label="Add tag" disabled={!tagChoices.length} />
          </div>
          <TextInput
            value={newTag}
            onChangeText={setNewTag}
            placeholder="New tag…"
            placeholderTextColor={t.textFaint}
            onSubmitEditing={() => {
              const v = newTag.trim();
              if (v) addTag(recording.id, v);
              setNewTag('');
            }}
            style={{ height: 30, width: 150, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: t.border, color: t.text, fontSize: 12.5, outlineStyle: 'none' } as any}
          />
        </View>
      </Card>
    </View>
  );

  const right = (
    <View style={{ width: twoPane ? (width >= 1500 ? 420 : 360) : undefined, gap: 16 }}>
      {isCur && audio.queueLength > 1 ? (
        <Card padding={10}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
            <Ionicons name="list" size={16} color={t.textSub} />
            <Text style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '800' }}>Up next in this sequence</Text>
            <Text style={{ color: t.textDim, fontSize: 12 }}>{audio.queueIndex + 1} / {audio.queueLength}</Text>
          </View>
          {audio.queue.slice(audio.queueIndex, audio.queueIndex + 12).map((q, i) => (
            <SideRow key={`${q.recording.id}-${i}`} title={q.recording.title} sub={speakerName(q.recording)} on={i === 0} playing={i === 0 && audio.isPlaying} onPress={() => audio.playAt(audio.queueIndex + i)} />
          ))}
        </Card>
      ) : null}
      {related.length > 1 ? (
        <Card padding={10}>
          <View style={{ padding: 8 }}>
            <Kicker text="Series" />
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginTop: 3 }} numberOfLines={2}>{recording.folder}</Text>
            <Text style={{ color: t.textDim, fontSize: 12, marginTop: 2 }}>{related.length} recordings</Text>
          </View>
          <ScrollView ref={seriesRef} style={{ maxHeight: 620 }}>
            {related.map((r) => (
              <SideRow
                key={r.id}
                title={r.title}
                sub={[r.date ? formatRecordingDate(r.date) : r.year, formatBytes(r.sizeBytes)].filter(Boolean).join(' · ')}
                on={r.id === recording.id}
                playing={audio.recording?.id === r.id && audio.isPlaying}
                downloaded={isDownloaded(r.id)}
                onPress={() => router.replace(`/lecture/${r.id}` as any)}
                onPlay={() => togglePlay(r)}
                onLayoutY={r.id === recording.id ? (y) => seriesRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: false }) : undefined}
              />
            ))}
          </ScrollView>
        </Card>
      ) : null}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 28 }}>
      <View style={{ flexDirection: twoPane ? 'row' : 'column', gap: 24, alignItems: 'flex-start', width: '100%', maxWidth: 1500, alignSelf: 'center' } as any}>
        {left}
        {right}
      </View>
    </ScrollView>
  );
}

function Meta({ icon, text, fs }: { icon: any; text: string; fs: (n: number) => number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={fs(15)} color={t.textDim} />
      <Text selectable style={{ color: t.textSub, fontSize: fs(13.5), fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function SideRow({
  title, sub, on, playing, downloaded, onPress, onPlay, onLayoutY,
}: { title: string; sub: string; on?: boolean; playing?: boolean; downloaded?: boolean; onPress: () => void; onPlay?: () => void; onLayoutY?: (y: number) => void }) {
  const t = useTheme();
  const row = (
    <Hover
      onPress={onPress}
      accessibilityLabel={title}
      style={({ hovered }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8,
        backgroundColor: on ? a(t.accent, 0.12) : hovered ? t.hover : 'transparent',
      } as any)}
    >
      {({ hovered }) => (
        <>
          <View style={{ width: 26, alignItems: 'center' }}>
            {playing ? (
              <Equalizer color={t.accent} playing />
            ) : hovered && onPlay ? (
              <IconButton icon="play" label="Play" size={26} iconSize={13} onPress={onPlay} />
            ) : (
              <Ionicons name={on ? 'radio-button-on' : 'musical-note-outline'} size={14} color={on ? t.accentText : t.textFaint} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: on ? t.accentText : t.text, fontSize: 12.5, fontWeight: on ? '800' : '600' }} numberOfLines={2}>{title}</Text>
            <Text style={{ color: t.textDim, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{sub}</Text>
          </View>
          {downloaded ? <Ionicons name="cloud-done" size={13} color={t.success} /> : null}
        </>
      )}
    </Hover>
  );
  if (!onLayoutY) return row;
  return <View onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}>{row}</View>;
}
