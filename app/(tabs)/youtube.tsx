import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from '../../components/SearchBar';
import MaharajSwitch from '../../components/MaharajSwitch';
import VideoCard from '../../components/VideoCard';
import { useMaharaj } from '../../contexts/MaharajContext';
import { useYouTube } from '../../hooks/useYouTube';

/**
 * Live YouTube search, scoped to the active Maharaja. This is the second half
 * of the catalogue: the audio archive holds the recorded back-catalogue, while
 * newer classes are published to YouTube and reachable only from here.
 */
export default function YouTubeScreen() {
  const { maharaj, active } = useMaharaj();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  // Resets when the Maharaja changes so a channel filter never leaks across.
  const [channelFilter, setChannelFilter] = useState<string | null>(null);

  const { videos, loading, loadingMore, error, hasMore, loadMore, retry } = useYouTube(
    maharaj.youtube.query,
    query,
  );

  const shown = useMemo(() => {
    if (!channelFilter) return videos;
    return videos.filter(
      (v) => v.channelId === channelFilter || v.channel === channelFilter,
    );
  }, [videos, channelFilter]);

  React.useEffect(() => setChannelFilter(null), [active]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <MaharajSwitch compact />

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={`Search ${maharaj.short} on YouTube…`}
      />

      {/* A horizontal ScrollView, deliberately NOT a horizontal FlatList: the
          FlatList measured its row before the chips laid out and, with a
          centring content container, squashed each chip below its own
          padding + label height, clipping the text. A ScrollView sizes to
          its content. */}
      {maharaj.youtube.channels.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipStrip}
        >
          {[{ name: 'All channels', channelId: '' }, ...maharaj.youtube.channels].map((item) => {
            const on = item.channelId
              ? channelFilter === item.channelId
              : channelFilter === null;
            return (
              <TouchableOpacity
                key={item.channelId || 'all'}
                onPress={() => setChannelFilter(item.channelId || null)}
                style={[
                  styles.chip,
                  on && { backgroundColor: maharaj.accent + '26', borderColor: maharaj.accent },
                ]}
              >
                <Text
                  style={[styles.chipText, on && { color: maharaj.accent, fontWeight: '700' }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={maharaj.accent} />
          <Text style={styles.centerText}>Searching YouTube…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={38} color="#2a3050" />
          <Text style={styles.emptyTitle}>Could not reach YouTube</Text>
          <Text style={styles.centerText}>{error}</Text>
          <TouchableOpacity onPress={retry} style={[styles.retryBtn, { borderColor: maharaj.accent }]}>
            <Text style={[styles.retryText, { color: maharaj.accent }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(v) => v.videoId}
          renderItem={({ item }) => <VideoCard video={item} />}
          contentContainerStyle={{ paddingBottom: 150, paddingTop: 6 }}
          keyboardShouldPersistTaps="handled"
          // Paging stays enabled while a channel chip is active: the chip
          // filters the accumulated list, so fetching further pages is
          // precisely how more of that channel's videos show up.
          onEndReached={() => {
            if (hasMore) loadMore();
          }}
          onEndReachedThreshold={0.6}
          ListHeaderComponent={
            shown.length > 0 ? (
              <Text style={styles.countText}>
                {shown.length} {shown.length === 1 ? 'video' : 'videos'}
                {channelFilter ? ' on this channel' : ''}
              </Text>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 18 }} color={maharaj.accent} />
            ) : hasMore ? (
              <TouchableOpacity onPress={loadMore} style={styles.moreBtn}>
                <Text style={[styles.moreText, { color: maharaj.accent }]}>Load more</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="videocam-off-outline" size={38} color="#2a3050" />
              <Text style={styles.emptyTitle}>No videos found</Text>
              <Text style={styles.centerText}>
                {channelFilter
                  ? 'No results from this channel — try “All channels”.'
                  : 'Try a different search.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0d1a' },
  chipStrip: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
  chip: {
    // minHeight + centring, NOT vertical padding alone. Measured on device,
    // the chip box came out 75px while its own padding took 47px, leaving the
    // 13sp label just 23px of the ~40px it needs — so the text overflowed and
    // was clipped. A floor on the height cannot be squeezed, and the label is
    // centred inside it.
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13, paddingVertical: 4, borderRadius: 9, maxWidth: 210,
    backgroundColor: '#141834', borderWidth: 1, borderColor: '#232a4d',
  },
  chipText: {
    color: '#c2c8e4', fontSize: 13, fontWeight: '600',
  },
  center: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40, gap: 8 },
  centerText: { color: '#5a6288', fontSize: 12.5, textAlign: 'center' },
  emptyTitle: { color: '#c9cee8', fontSize: 15, fontWeight: '700', marginTop: 6 },
  countText: { color: '#5a6288', fontSize: 11.5, fontWeight: '600', marginHorizontal: 16, marginBottom: 6 },
  retryBtn: {
    marginTop: 12, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
  },
  retryText: { fontSize: 13, fontWeight: '700' },
  moreBtn: { alignItems: 'center', paddingVertical: 16 },
  moreText: { fontSize: 13.5, fontWeight: '700' },
});
