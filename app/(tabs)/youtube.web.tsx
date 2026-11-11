import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../components/desktop/theme';
import { Button, Chip, Empty, SearchField, Spinner } from '../../components/desktop/kit';
import { LoadingInline, VideoGrid } from '../../components/desktop/recordings';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useYouTube } from '../../hooks/useYouTube';
import { honoured } from '../../data/maharajas';
import { hasArchiveAudio } from '../../utils/matchArchive';

/** Desktop YouTube: live search scoped to the speaker, channel filters, a paging video grid. */
export default function YouTubeScreen() {
  const t = useTheme();
  const { maharaj, active } = useMaharaj();
  const [query, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const { videos, loading, loadingMore, error, hasMore, loadMore, retry } = useYouTube(maharaj.youtube.query, query);

  useEffect(() => setChannelFilter(null), [active]);

  const shown = useMemo(
    () => (channelFilter ? videos.filter((v) => v.channelId === channelFilter || v.channel === channelFilter) : videos),
    [videos, channelFilter],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingVertical: 26, paddingHorizontal: 32 }}
      scrollEventThrottle={200}
      onScroll={(e) => {
        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
        if (hasMore && !loadingMore && contentOffset.y + layoutMeasurement.height > contentSize.height - 600) loadMore();
      }}
    >
      <View style={{ width: '100%', maxWidth: 1600, alignSelf: 'center' } as any}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 20, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.textDim, fontSize: 12, fontWeight: '700' }}>Live search · YouTube</Text>
            <Text style={{ color: t.text, fontSize: 26, fontWeight: '800', marginTop: 2 }}>{honoured(maharaj.short)}</Text>
          </View>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={`Search ${honoured(maharaj.short)} on YouTube…`}
            style={{ width: 460 }}
          />
        </View>

        {maharaj.youtube.channels.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {[{ name: 'All channels', channelId: '' }, ...maharaj.youtube.channels].map((c) => (
              <Chip
                key={c.channelId || 'all'}
                label={c.name}
                icon={c.channelId ? 'logo-youtube' : 'apps-outline'}
                on={c.channelId ? channelFilter === c.channelId : channelFilter === null}
                onPress={() => setChannelFilter(c.channelId || null)}
              />
            ))}
          </View>
        )}

        {loading && videos.length === 0 ? (
          <Spinner label="Searching YouTube…" />
        ) : error ? (
          <Empty icon="cloud-offline-outline" title="Could not reach YouTube" text={error} action={<Button label="Try again" onPress={retry} />} />
        ) : shown.length === 0 ? (
          <Empty
            icon="videocam-off-outline"
            title="No videos found"
            text={channelFilter ? 'No results from this channel yet — scroll for more, or pick “All channels”.' : 'Try a different search.'}
            action={channelFilter && hasMore ? <Button label="Load more" onPress={loadMore} /> : undefined}
          />
        ) : (
          <>
            <Text style={{ color: t.textDim, fontSize: 12.5, fontWeight: '600', marginBottom: 14 }}>
              {shown.length} {shown.length === 1 ? 'video' : 'videos'}
              {channelFilter ? ' on this channel' : ''}
              {loading ? ' · updating…' : ''}
            </Text>
            <VideoGrid
              videos={shown}
              minWidth={260}
              badgeFor={(v) => (hasArchiveAudio(v.title, active) ? 'ALSO AS AUDIO' : undefined)}
            />
          </>
        )}

        {loadingMore ? <LoadingInline label="Loading more videos…" /> : hasMore && shown.length > 0 ? (
          <View style={{ alignItems: 'center', marginTop: 24 }}>
            <Button label="Load more" onPress={loadMore} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
