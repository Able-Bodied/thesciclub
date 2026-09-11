import { describe, expect, it } from 'vitest';
import {
  EXACT_LEVELS,
  rangeForExact,
  regionForRange,
  stateCodeForName,
  stateNameFor,
  US_STATES,
} from '@/types/domain';

describe('rangeForExact', () => {
  it('buckets cervical levels either side of C4', () => {
    expect(rangeForExact('C4')).toBe('C1–C4');
    expect(rangeForExact('C5')).toBe('C5–C8');
  });

  it('buckets thoracic levels either side of T6', () => {
    expect(rangeForExact('T6')).toBe('T1–T6');
    expect(rangeForExact('T7')).toBe('T7–T12');
    expect(rangeForExact('T12')).toBe('T7–T12');
  });

  it('puts lumbar and sacral together', () => {
    expect(rangeForExact('L1')).toBe('L1–S5');
    expect(rangeForExact('S5')).toBe('L1–S5');
  });

  it('reads a between-segments level by its first segment, not its second', () => {
    // "C4/5" is bucketed as C4 rather than C5: the conservative read, which
    // does not overstate function.
    expect(rangeForExact('C4/5')).toBe('C1–C4');
    expect(rangeForExact('C5/6')).toBe('C5–C8');
    expect(rangeForExact('C6/7')).toBe('C5–C8');
    expect(rangeForExact('T11/12')).toBe('T7–T12');
  });

  it('maps "Do not know" to "Not sure yet" rather than guessing a bucket', () => {
    expect(rangeForExact('Do not know')).toBe('Not sure yet');
  });

  it('produces a valid range for every level the app offers', () => {
    for (const level of EXACT_LEVELS) {
      const range = rangeForExact(level);
      expect(regionForRange(range)).toBeTruthy();
    }
  });
});

describe('US states', () => {
  it('covers all fifty plus DC', () => {
    expect(US_STATES).toHaveLength(51);
  });

  it('round-trips a name to a code and back', () => {
    expect(stateCodeForName('California')).toBe('CA');
    expect(stateNameFor('CA')).toBe('California');
  });

  it('is case and whitespace tolerant, because a geocoder is not consistent', () => {
    expect(stateCodeForName('  california ')).toBe('CA');
  });

  it('returns null for something that is not a state', () => {
    expect(stateCodeForName('Ontario')).toBeNull();
    expect(stateNameFor('XX')).toBeNull();
  });
});
