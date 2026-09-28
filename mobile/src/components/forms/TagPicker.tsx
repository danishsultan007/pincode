import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { space } from '@/theme/tokens';
import { TAGS } from '@/lib/constants';

export type TagPickerProps = {
  value: string | null;
  onChange: (tag: string | null) => void;
};

// cook / maid / repair / electrician / plumber / pets / doctor / other, plus
// a free-text custom tag (MOBILE-PLAN.md §4 Compose).
export function TagPicker({ value, onChange }: TagPickerProps) {
  const known = TAGS.some((t) => t.code === value);
  const [customMode, setCustomMode] = useState(!!value && !known);
  const [custom, setCustom] = useState(known ? '' : value ?? '');

  if (customMode) {
    return (
      <TextField
        label="Tag"
        value={custom}
        onChangeText={(v) => {
          setCustom(v);
          onChange(v.trim() ? v.trim().toLowerCase() : null);
        }}
        placeholder="e.g. tutor"
        maxLength={20}
        right={
          <Button
            label="Choose from list"
            size="sm"
            variant="text"
            onPress={() => {
              setCustomMode(false);
              onChange(null);
            }}
          />
        }
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <ChipRow scroll={false}>
        {TAGS.map((t) => (
          <Chip key={t.code} label={t.label} selected={value === t.code} onPress={() => onChange(t.code)} />
        ))}
        <Chip label="Other…" onPress={() => setCustomMode(true)} />
      </ChipRow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s1 },
});
