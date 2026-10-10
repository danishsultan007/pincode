import React, { useRef, useState } from 'react';
import { KeyboardTypeOptions, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from './Icon';
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
  /** Show the eye toggle on password fields. Defaults to true. */
  showPasswordToggle?: boolean;
  autoComplete?: 'current-password' | 'new-password' | 'username' | 'email' | 'off';
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onSubmitEditing?: () => void;
};

// Web only: stop mouse-down from moving focus off the input onto the eye button
// (click/onPress still fire). Not applied on native.
const webKeepFocus =
  Platform.OS === 'web' ? ({ onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() } as object) : undefined;

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
  showPasswordToggle = true,
  autoComplete,
  keyboardType,
  placeholder,
  autoFocus,
  autoCapitalize,
  onSubmitEditing,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const wasFocused = useRef(false);
  // On web the eye takes focus on mouse-down, so the input blurs just before the
  // press starts; compare timestamps to tell that apart from an earlier blur.
  const blurAt = useRef(0);
  const pressDownAt = useRef(0);
  const isPassword = !!secureTextEntry;
  const secure = isPassword && !revealed;
  const valueRef = useRef(value);
  valueRef.current = value;

  const toggleReveal = () => {
    // onPressIn doesn't fire for TalkBack/keyboard activation, so also ask the
    // input itself whether it is focused.
    const blurredByPress = pressDownAt.current > 0 && blurAt.current > 0 && blurAt.current >= pressDownAt.current - 150;
    const keepFocus = wasFocused.current || !!inputRef.current?.isFocused?.() || blurredByPress;
    wasFocused.current = false;
    blurAt.current = 0;
    pressDownAt.current = 0;
    setRevealed((r) => !r);
    // Best effort: toggling secureTextEntry can drop focus/cursor on Android, and
    // Fabric may apply the new prop after this frame, so the cursor can still
    // jump on some devices.
    // Two frames (plus a timeout) so React has committed the new secureTextEntry
    // first. Native exposes setSelection; the web <input> has setSelectionRange,
    // and it needs this even though focus never left (the caret resets when the
    // input type flips).
    const restore = () => {
      const el = inputRef.current as any;
      el?.focus?.();
      const end = valueRef.current.length;
      if (typeof el?.setSelection === 'function') el.setSelection(end, end);
      else if (typeof el?.setSelectionRange === 'function') el.setSelectionRange(end, end);
    };
    if (!keepFocus) return;
    requestAnimationFrame(() => requestAnimationFrame(restore));
    setTimeout(restore, 0);
  };

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
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.ink3}
          multiline={multiline}
          maxLength={maxLength}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          autoCapitalize={isPassword ? 'none' : (autoCapitalize ?? 'sentences')}
          {...(isPassword ? { autoCorrect: false, spellCheck: false } : null)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={onSubmitEditing && !multiline ? 'send' : undefined}
          blurOnSubmit={!multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            blurAt.current = Date.now();
            setFocused(false);
          }}
          style={[styles.input, multiline ? styles.multilineInput : null]}
        />
        {isPassword && showPasswordToggle ? (
          <Pressable
            {...webKeepFocus}
            onPressIn={() => {
              pressDownAt.current = Date.now();
              wasFocused.current = focused;
            }}
            onPress={toggleReveal}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ checked: revealed }}
            style={styles.toggle}
          >
            <Icon name={revealed ? 'eye-off' : 'eye'} size={18} color={colors.ink3} />
          </Pressable>
        ) : null}
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
  toggle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  prefix: { color: colors.ink2, fontWeight: '600' },
  errorText: { color: colors.danger, fontWeight: '500' },
});
