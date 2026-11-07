import React, { useCallback, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { formatMs } from '../utils/time';

interface Props {
  positionMs: number;
  durationMs: number;
  /** Called once, on release, with the chosen position. */
  onSeek: (ms: number) => void;
  accent: string;
  /** Greys out and ignores touches when this recording isn't the active one. */
  enabled?: boolean;
}

/**
 * Draggable scrub bar.
 *
 * Touch is handled with PanResponder against ABSOLUTE screen X
 * (`gestureState.x0` / `moveX`) rather than a locationX on the touched child:
 * the thumb is a child of the track, so a locationX-based reading jumps as
 * soon as the finger crosses onto it. The track is measured on layout to
 * convert screen X into a ratio.
 *
 * While dragging, `dragRatio` overrides the playback position so the thumb
 * follows the finger instead of snapping back on every progress tick; the
 * actual seek is issued once on release.
 */
export default function SeekBar({
  positionMs, durationMs, onSeek, accent, enabled = true,
}: Props) {
  const trackRef = useRef<View>(null);
  const trackPageX = useRef(0);
  const trackWidth = useRef(1);

  const [dragRatio, setDragRatio] = useState<number | null>(null);

  // Re-measure on every layout change (scroll, rotation, font scale).
  const onLayout = useCallback(() => {
    trackRef.current?.measure((_x, _y, width, _h, pageX) => {
      trackPageX.current = pageX;
      trackWidth.current = Math.max(1, width);
    });
  }, []);

  // Latest values, so the responder closure (created once) never seeks
  // against a stale duration.
  const stateRef = useRef({ durationMs, onSeek, enabled });
  stateRef.current = { durationMs, onSeek, enabled };

  const clamp = (pageX: number) =>
    Math.max(0, Math.min((pageX - trackPageX.current) / trackWidth.current, 1));

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => stateRef.current.enabled,
      onMoveShouldSetPanResponder: () => stateRef.current.enabled,
      // Claim the gesture so a parent ScrollView doesn't steal a horizontal drag.
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (_e, gs) => setDragRatio(clamp(gs.x0)),
      onPanResponderMove: (_e, gs) => setDragRatio(clamp(gs.moveX)),

      onPanResponderRelease: (_e, gs) => {
        const ratio = clamp(gs.moveX || gs.x0);
        setDragRatio(null);
        const { durationMs: d, onSeek: seek } = stateRef.current;
        if (d > 0) seek(ratio * d);
      },

      // Gesture stolen (e.g. the scroll view took over) — cancel, don't seek.
      onPanResponderTerminate: () => setDragRatio(null),
    }),
  ).current;

  const playbackRatio = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const ratio = dragRatio ?? playbackRatio;
  // Typed as a percentage literal so it satisfies DimensionValue for both
  // `width` and `left`.
  const pct = `${(ratio * 100).toFixed(2)}%` as `${number}%`;

  // Mid-drag, show where the finger is rather than where playback still is.
  const shownMs = dragRatio !== null ? dragRatio * durationMs : positionMs;

  return (
    <View style={styles.wrap}>
      {/* Tall padded hit area — a 4px track is far too thin to grab. */}
      <View
        ref={trackRef}
        style={styles.hitArea}
        onLayout={onLayout}
        {...responder.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: pct, backgroundColor: accent }]} />
          <View
            style={[
              styles.thumb,
              { left: pct, backgroundColor: accent },
              dragRatio !== null && styles.thumbActive,
              !enabled && styles.thumbDisabled,
            ]}
          />
        </View>
      </View>

      <View style={styles.timeRow}>
        <Text style={[styles.time, dragRatio !== null && { color: accent }]}>
          {formatMs(shownMs)}
        </Text>
        <Text style={styles.time}>{durationMs > 0 ? formatMs(durationMs) : '--:--'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 2 },
  hitArea: { paddingVertical: 18 },
  track: { height: 4, backgroundColor: '#2a3050', borderRadius: 2, position: 'relative' },
  fill: { height: 4, borderRadius: 2, position: 'absolute', left: 0, top: 0 },
  thumb: {
    width: 18, height: 18, borderRadius: 9,
    position: 'absolute', top: -7, marginLeft: -9,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  // Grows under the finger so it's clear the drag has been picked up.
  thumbActive: { width: 24, height: 24, borderRadius: 12, top: -10, marginLeft: -12 },
  thumbDisabled: { backgroundColor: '#39406a' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  time: { color: '#6b73a0', fontSize: 11.5, fontWeight: '700' },
});
