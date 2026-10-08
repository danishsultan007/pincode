import React from 'react';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';

export type DurationChipsProps = {
  options: string[];
  value: string | null;
  onChange: (label: string) => void;
};

// Reused for both the alert "Until" chips (1h, 3h, 6h, Tonight, 24h) and the
// event duration chips (1h, 2h, 3h, Half day, All day) — MOBILE-PLAN.md §4.
export function DurationChips({ options, value, onChange }: DurationChipsProps) {
  return (
    <ChipRow flush scroll={false}>
      {options.map((label) => (
        <Chip key={label} label={label} selected={value === label} onPress={() => onChange(label)} />
      ))}
    </ChipRow>
  );
}

// Resolves a duration chip label to milliseconds from now, per the prototype.
export function durationMs(label: string): number {
  const HOUR = 60 * 60 * 1000;
  switch (label) {
    case '1h':
      return 1 * HOUR;
    case '2h':
      return 2 * HOUR;
    case '3h':
      return 3 * HOUR;
    case '6h':
      return 6 * HOUR;
    case '24h':
      return 24 * HOUR;
    case 'Half day':
      return 4 * HOUR;
    case 'All day':
      return 10 * HOUR;
    case 'Tonight': {
      const now = new Date();
      const tonight = new Date(now);
      tonight.setHours(23, 0, 0, 0);
      const ms = tonight.getTime() - now.getTime();
      return ms > 0 ? ms : 6 * HOUR;
    }
    default:
      return 3 * HOUR;
  }
}
