import React from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { colors, font, radius, space } from '@/theme/tokens';

export type SearchInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onClear?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
};

export function SearchInput({ value, onChangeText, placeholder, onClear, autoFocus, compact }: SearchInputProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Icon name="search" size={16} color={colors.ink3} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        autoFocus={autoFocus}
        autoCapitalize="none"
        style={styles.input}
      />
      {value.length > 0 && onClear ? <IconButton name="x" label="Clear search" onPress={onClear} size={14} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 0,
    backgroundColor: colors.surface2,
    paddingHorizontal: 14,
  },
  wrapCompact: { height: 38 },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: colors.ink,
    fontFamily: font.regular,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
});
