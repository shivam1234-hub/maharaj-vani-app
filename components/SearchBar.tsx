import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFilterPress?: () => void;
  activeFilterCount?: number;
  placeholder?: string;
}

export function SearchBar({
  value, onChange, onFilterPress, activeFilterCount = 0,
  placeholder = 'Search chapter, verse, location…',
}: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={18} color="#666" style={styles.icon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#444"
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')} style={styles.clear}>
            <Ionicons name="close-circle" size={18} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      {onFilterPress && (
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={onFilterPress}
        >
          <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? '#FF7722' : '#888'} />
          {activeFilterCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121629',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: '#1e2545',
  },
  icon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#eee',
    paddingVertical: 0,
  },
  clear: { padding: 4 },
  filterBtn: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#121629', borderWidth: 1, borderColor: '#1e2545',
  },
  filterBtnActive: { borderColor: '#FF7722', backgroundColor: '#FF772215' },
  badge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: '#FF7722', width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
