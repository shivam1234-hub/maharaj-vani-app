import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Ionicons name="compass-outline" size={44} color="#2a3050" />
        <Text style={styles.title}>This screen doesn’t exist</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0a0d1a', gap: 10, padding: 20,
  },
  title: { color: '#c9cee8', fontSize: 16, fontWeight: '700' },
  link: {
    marginTop: 8, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#2a3050',
  },
  linkText: { color: '#98a0c8', fontSize: 13, fontWeight: '700' },
});
