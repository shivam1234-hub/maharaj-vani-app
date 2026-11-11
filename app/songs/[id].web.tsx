import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import SongsDesktop from '../../components/desktop/SongsDesktop';

/** Desktop: a song link opens the two-pane Prayers & Songs page with it selected. */
export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SongsDesktop initialId={id ? String(id) : undefined} />;
}
