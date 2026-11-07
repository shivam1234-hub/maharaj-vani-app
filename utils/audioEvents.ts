type PlayEvent = { id: string; title: string; type: string; positionMs: number; durationMs: number };
type Listener = (e: PlayEvent) => void;
const listeners: Listener[] = [];
export const audioEvents = {
  emitPlay: (e: PlayEvent) => listeners.forEach(l => l(e)),
  onPlay: (l: Listener) => {
    listeners.push(l);
    return () => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
};
