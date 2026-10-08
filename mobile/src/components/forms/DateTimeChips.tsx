import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { space } from '@/theme/tokens';

export type DateTimeChipsProps = {
  value: Date | null;
  onChange: (date: Date) => void;
};

const DAYS = 14;
const SLOT_MINUTES = 30;
const START_HOUR = 6;
const END_HOUR = 22;

function dayLabel(d: Date, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(d);
}

// Next 14 days x 30-minute slots (MOBILE-PLAN.md §4 Compose, Event).
export function DateTimeChips({ value, onChange }: DateTimeChipsProps) {
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const [selectedDay, setSelectedDay] = useState<Date>(() => (value ? startOfDay(value) : days[0]));

  const slots = useMemo(() => {
    const list: Date[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_MINUTES) {
        if (h === END_HOUR && m > 0) continue;
        const d = new Date(selectedDay);
        d.setHours(h, m, 0, 0);
        list.push(d);
      }
    }
    return list;
  }, [selectedDay]);

  return (
    <View style={styles.wrap}>
      <ChipRow flush>
        {days.map((d, i) => (
          <Chip
            key={d.toISOString()}
            label={dayLabel(d, i)}
            selected={isSameDay(d, selectedDay)}
            onPress={() => setSelectedDay(d)}
          />
        ))}
      </ChipRow>
      <ChipRow flush>
        {slots.map((slot) => (
          <Chip
            key={slot.toISOString()}
            label={timeLabel(slot)}
            selected={!!value && slot.getTime() === value.getTime()}
            onPress={() => onChange(slot)}
          />
        ))}
      </ChipRow>
    </View>
  );
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const styles = StyleSheet.create({
  wrap: { gap: space.s2 },
});
