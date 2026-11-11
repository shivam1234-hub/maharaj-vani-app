import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

/** Scrolling page body with desktop gutters and a comfortable max width. */
export default function Page({
  children, maxWidth = 1480, style, scrollRef,
}: { children: React.ReactNode; maxWidth?: number; style?: StyleProp<ViewStyle>; scrollRef?: React.Ref<ScrollView> }) {
  const t = useTheme();
  return (
    <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingVertical: 28, paddingHorizontal: 32 }}>
      <View style={[{ width: '100%', maxWidth, alignSelf: 'center' } as any, style]} >
        {children}
      </View>
    </ScrollView>
  );
}
