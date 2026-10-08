import React, { useState } from 'react';
import { KeyboardTypeOptions, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { colors, font, radius, space } from '@/theme/tokens';

export type TextFieldProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
  right?: React.ReactNode;
  prefix?: string;
  multiline?: boolean;
  maxLength?: number;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onSubmitEditing?: () => void;
};

export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  right,
  prefix,
  multiline,
  maxLength,
  secureTextEntry,
  keyboardType,
  placeholder,
  autoFocus,
  autoCapitalize,
  onSubmitEditing,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="fieldLabel">
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          multiline ? styles.multilineField : null,
          focused ? styles.focused : null,
          error ? styles.errorField : null,
        ]}
      >
        {prefix ? (
          <Text variant="body" style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.ink3}
          multiline={multiline}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={onSubmitEditing && !multiline ? 'send' : undefined}
          blurOnSubmit={!multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, multiline ? styles.multilineInput : null]}
        />
        {right}
      </View>
      {error ? (
        <Text variant="meta" style={styles.errorText}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="meta">{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
    backgroundColor: colors.surface2,
  },
  multilineField: { minHeight: 112, alignItems: 'flex-start', paddingVertical: space.s3 },
  focused: { borderColor: colors.accent, backgroundColor: colors.surface, boxShadow: `0 0 0 4px ${colors.focusRing}` },
  errorField: { borderColor: colors.danger },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    fontFamily: font.regular,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  multilineInput: { minHeight: 84, textAlignVertical: 'top' },
  prefix: { color: colors.ink2, fontWeight: '600' },
  errorText: { color: colors.danger, fontWeight: '500' },
});
