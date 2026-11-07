import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../../constants/theme';
import { useDownload } from '../../contexts/DownloadContext';
import { useMaharaj } from '../../contexts/MaharajContext';

export default function TabsLayout() {
  const { progress } = useDownload();
  const { maharaj } = useMaharaj();
  const insets = useSafeAreaInsets();

  const activeDownloads = Object.values(progress).filter((p) => p.status !== 'error').length;

  return (
    <Tabs
      screenOptions={{
        // 64 + inset: MiniPlayer sits exactly this far up on tab screens.
        tabBarStyle: [styles.tabBar, { height: 64 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        // The tab bar takes the active Maharaja's accent, so the switch is
        // legible from anywhere in the app.
        tabBarActiveTintColor: maharaj.accent,
        tabBarInactiveTintColor: C.textFaint,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="youtube"
        options={{
          title: 'Video',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'play-circle' : 'play-circle-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Downloads',
          tabBarBadge: activeDownloads > 0 ? activeDownloads : undefined,
          tabBarBadgeStyle: { backgroundColor: maharaj.accent, fontSize: 10 },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cloud-download' : 'cloud-download-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: C.surfaceLo,
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 0,
  },
  tabLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
