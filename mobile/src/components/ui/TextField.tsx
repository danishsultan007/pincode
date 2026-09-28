import React, { useState } from 'react';
import { KeyboardTypeOptions, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { colors, radius, space } from '@/theme/tokens';

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
        <Text variant="label" style={styles.label}>
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
  wrap: { gap: space.s1 },
  label: { marginBottom: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.s3,
    minHeight: 44,
    backgroundColor: colors.surface,
    gap: space.s2,
  },
  multilineField: { minHeight: 88, alignItems: 'flex-start', paddingVertical: space.s3 },
  focused: { borderColor: colors.accent },
  errorField: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    paddingVertical: space.s2,
  },
  multilineInput: { minHeight: 66, textAlignVertical: 'top' },
  prefix: { color: colors.ink2 },
  errorText: { color: colors.danger },
});
