import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import VersesDesktop from '../../components/desktop/VersesDesktop';

/** Desktop Verses tab: the three-pane reader (see components/desktop/VersesDesktop.tsx). */
export default function VersesScreen() {
  const params = useLocalSearchParams<{ book?: string; part?: string; n?: string; entry?: string }>();
  return <VersesDesktop params={params} />;
}
