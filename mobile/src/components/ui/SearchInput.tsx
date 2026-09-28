import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { colors, radius, space } from '@/theme/tokens';

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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.s3,
  },
  wrapCompact: { height: 36 },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
  },
});
