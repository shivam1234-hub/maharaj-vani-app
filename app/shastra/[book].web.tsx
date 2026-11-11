import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Desktop: book, chapter and verse all live in the three-pane Verses tab, so
 * the phone's /shastra/* links (from lectures, history, deep links) redirect
 * there with the same selection.
 */
export default function ShastraRedirect() {
  const p = useLocalSearchParams<{ book?: string; part?: string; n?: string; entry?: string }>();
  const book = String(p.book ?? 'BG').toUpperCase();
  const q = new URLSearchParams({ book });
  if (p.n) {
    q.set('part', String(p.part ?? ''));
    q.set('n', String(p.n));
  } else {
    // A whole book: open its first chapter.
    q.set('part', book === 'SB' ? '1' : book === 'CC' ? 'adi' : '');
    q.set('n', '1');
  }
  if (p.entry) q.set('entry', String(p.entry));
  return <Redirect href={`/verses?${q.toString()}` as any} />;
}
