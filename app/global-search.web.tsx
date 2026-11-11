import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Page from '../components/desktop/Page';
import { useTheme } from '../components/desktop/theme';
import { Button, Card, Chip, Empty, Hover } from '../components/desktop/kit';
import { LoadingInline, RecordingList, VideoGrid } from '../components/desktop/recordings';
import { useDesktopSearch } from '../components/desktop/Shell';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { MAHARAJAS, honoured } from '../data/maharajas';
import { useMaharaj } from '../contexts/MaharajContext';

type Scope = 'all' | 'audio' | 'video';

const SUGGESTIONS = ['Bhagavad-gita 2.47', 'SB 1.2.6', 'humility', 'Vrindavan', 'Janmashtami', 'Mayapur 2010', 'holy name', 'Gaura Purnima'];

/**
 * Desktop "Search everything": driven by the search box in the top bar.
 * Every speaker's archive (instant, local) beside live YouTube results.
 */
export default function GlobalSearchScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { query, setQuery, focusSearch } = useDesktopSearch();
  const params = useLocalSearchParams<{ q?: string }>();
  const { setActive } = useMaharaj();
  const [scope, setScope] = useState<Scope>('all');
  React.useEffect(() => {
    if (params.q) setQuery(String(params.q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);
  React.useEffect(() => {
    focusSearch();
  }, [focusSearch]);

  const { audio, audioTotal, videos, videosLoading, videosError, audioByMaharaj } = useGlobalSearch(query);
  const has = query.trim().length > 0;
  const side = width >= 1300 && scope === 'all';

  if (!has) {
    return (
      <Page maxWidth={860}>
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="planet-outline" size={34} color={t.accentText} />
          </View>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', marginTop: 18 }}>Search everything</Text>
          <Text style={{ color: t.textDim, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>
            Every speaker at once — the audio archive of all nine, and their lectures on YouTube.{'\n'}
            Type in the search box above (Ctrl+K). Titles, verses, places and years all match.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 24 }}>
            {SUGGESTIONS.map((s) => <Chip key={s} label={s} icon="search" on={false} onPress={() => setQuery(s)} />)}
          </View>
        </View>
      </Page>
    );
  }

  const audioBlock = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="headset" size={17} color={t.textSub} />
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>Audio archive</Text>
        <Text style={{ color: t.textDim, fontSize: 13 }}>
          {audioTotal.toLocaleString()} {audioTotal === 1 ? 'match' : 'matches'}{audio.length < audioTotal ? ` · top ${audio.length}` : ''}
        </Text>
      </View>
      {audio.length ? (
        <Card padding={6}><RecordingList rows={audio} showSpeaker /></Card>
      ) : (
        <Text style={{ color: t.textDim, fontSize: 13 }}>No recordings match “{query}”.</Text>
      )}
    </View>
  );

  const videoBlock = (
    <View style={side ? { width: 420 } : { flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="logo-youtube" size={17} color={t.youtube} />
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>YouTube</Text>
        <Text style={{ color: t.textDim, fontSize: 13 }}>{videos.length ? `${videos.length} videos` : ''}</Text>
      </View>
      {videosLoading && !videos.length ? (
        <LoadingInline label="Searching YouTube for every speaker…" />
      ) : videosError ? (
        <Text style={{ color: t.textDim, fontSize: 13 }}>{videosError}</Text>
      ) : videos.length ? (
        <VideoGrid videos={videos} minWidth={side ? 190 : 250} gap={16} />
      ) : (
        <Text style={{ color: t.textDim, fontSize: 13 }}>{query.trim().length < 3 ? 'Type at least 3 letters to search YouTube.' : 'No videos found.'}</Text>
      )}
    </View>
  );

  return (
    <Page maxWidth={1680}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', marginRight: 10 }} numberOfLines={1}>“{query.trim()}”</Text>
        <Chip label="Everything" on={scope === 'all'} onPress={() => setScope('all')} />
        <Chip label="Audio" icon="headset-outline" count={audioTotal} on={scope === 'audio'} onPress={() => setScope('audio')} />
        <Chip label="YouTube" icon="logo-youtube" count={videos.length} color={t.youtube} on={scope === 'video'} onPress={() => setScope('video')} />
      </View>
      {audioByMaharaj.length > 0 && scope !== 'video' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {audioByMaharaj.map(({ key, count }) => (
            <Hover
              key={key}
              onPress={() => { setActive(key); router.navigate(`/browse?q=${encodeURIComponent(query.trim())}` as any); }}
              accessibilityLabel={`Browse ${honoured(MAHARAJAS[key].short)}`}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: hovered ? t.surfaceHi : t.surface, borderWidth: 1, borderColor: t.border } as any)}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: MAHARAJAS[key].accent }} />
              <Text style={{ color: t.textSub, fontSize: 12 }}>{honoured(MAHARAJAS[key].short)}</Text>
              <Text style={{ color: t.textFaint, fontSize: 12, fontWeight: '700' }}>{count}</Text>
            </Hover>
          ))}
        </View>
      ) : null}
      {scope === 'audio' ? audioBlock : scope === 'video' ? videoBlock : side ? (
        <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>{audioBlock}{videoBlock}</View>
      ) : (
        <View style={{ gap: 30 }}>{audioBlock}{videoBlock}</View>
      )}
      {audio.length === 0 && !videos.length && !videosLoading ? (
        <Empty icon="search-outline" title="Nothing found" text="Try fewer words, or a verse like “BG 2.13”." action={<Button label="Clear search" onPress={() => setQuery('')} />} />
      ) : null}
    </Page>
  );
}
