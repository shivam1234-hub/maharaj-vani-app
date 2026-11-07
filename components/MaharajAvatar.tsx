import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaharajConfig } from '../data/maharajas';
import { alpha } from '../constants/theme';

/**
 * Monogram disc standing in for a portrait: the app ships no photographs of
 * the Maharajas, and an initials disc in their accent reads clearly at every
 * size from the picker to the player.
 */
export default function MaharajAvatar({
  maharaj, size = 48, active = true,
}: { maharaj: MaharajConfig; size?: number; active?: boolean }) {
  const ring = Math.max(2, Math.round(size / 24));
  const letters = maharaj.initials;
  const scale = letters.length > 3 ? 0.25 : letters.length > 2 ? 0.3 : 0.36;
  return (
    <View
      style={[
        styles.ring,
        {
          width: size + ring * 4,
          height: size + ring * 4,
          borderRadius: (size + ring * 4) / 2,
          borderWidth: ring,
          borderColor: active ? maharaj.accent : 'transparent',
        },
      ]}
    >
      <View
        style={[
          styles.disc,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: maharaj.accent + alpha(active ? 0.22 : 0.1),
          },
        ]}
      >
        {/* Inner glow: a smaller, brighter disc gives depth without a gradient library. */}
        <View
          style={{
            position: 'absolute',
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            backgroundColor: maharaj.accent + alpha(active ? 0.18 : 0.06),
          }}
        />
        <Text
          style={{
            color: active ? maharaj.accent : maharaj.accent + alpha(0.6),
            fontSize: size * scale,
            fontWeight: '800',
            letterSpacing: 0.5,
          }}
        >
          {letters}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
