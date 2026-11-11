import { Tabs } from 'expo-router';
import { useTheme } from '../../components/desktop/theme';

/**
 * Desktop: the same six tab routes, but no bottom tab bar — the sidebar in
 * components/desktop/Shell.tsx navigates between them. Tabs (rather than a
 * Slot) keeps each screen mounted, so switching back to Browse finds the
 * search and scroll position as you left them, as on the phone.
 */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="verses" options={{ title: 'Verses' }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
      <Tabs.Screen name="youtube" options={{ title: 'YouTube' }} />
      <Tabs.Screen name="downloads" options={{ title: 'Downloads' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
