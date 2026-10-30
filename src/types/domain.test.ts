import { describe, expect, it } from 'vitest';
import {
  asksCompleteness,
  asksLevel,
  EXACT_LEVELS,
  injuryLabel,
  levelsForType,
  OFFERED_INJURY_TYPES,
  rangeForExact,
  regionForRange,
  SPINAL_CORD_CONDITIONS,
  stateCodeForName,
  stateNameFor,
  typeForLevel,
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

describe('the spinal cord question', () => {
  it('offers a para the levels from T1 down, and a quad or central cord the neck', () => {
    const para = levelsForType('para');
    expect(para[0]).toBe('T1');
    expect(para).toContain('S5');
    expect(para).toContain('T11/12');
    expect(para.some((l) => l.startsWith('C'))).toBe(false);
    const quad = levelsForType('quad');
    expect(quad).toEqual(levelsForType('central_cord'));
    expect(quad.every((l) => l.startsWith('C') || l === 'Do not know')).toBe(true);
    expect(quad).toContain('C5/6');
  });

  it('offers a condition, or no answer yet, every level, with "Do not know" last', () => {
    expect(levelsForType('condition')).toHaveLength(EXACT_LEVELS.length);
    expect(levelsForType(null).at(-1)).toBe('Do not know');
    expect(levelsForType('para').at(-1)).toBe('Do not know');
  });

  // The owner, 2026-10-15: high para is T1 to T8, low para T9 down.
  it('splits para at T8: high T1 to T8, low T9 to S5', () => {
    const high = levelsForType('high_para');
    expect(high[0]).toBe('T1');
    expect(high.at(-2)).toBe('T8');
    expect(high.at(-1)).toBe('Do not know');
    const low = levelsForType('low_para');
    expect(low[0]).toBe('T9');
    expect(low).toContain('T11/12');
    expect(low).toContain('S5');
    expect(low.some((l) => l.startsWith('C') || l === 'T8')).toBe(false);
  });

  it('offers quad, high para, low para, other disability and relative, in that order', () => {
    expect(OFFERED_INJURY_TYPES).toEqual([
      'quad',
      'high_para',
      'low_para',
      'condition',
      'family',
      'professional',
    ]);
  });

  it('asks a level of an injury only, not of another disability or a relative', () => {
    expect(asksLevel('quad')).toBe(true);
    expect(asksLevel('high_para')).toBe(true);
    expect(asksLevel('low_para')).toBe(true);
    expect(asksLevel('condition')).toBe(true);
    expect(asksLevel('family')).toBe(false);
    expect(asksLevel('professional')).toBe(false);
    expect(asksLevel(null)).toBe(false);
  });

  it("suggests the owner's spinal cord conditions, then central cord syndrome", () => {
    expect(SPINAL_CORD_CONDITIONS).toHaveLength(26);
    expect(SPINAL_CORD_CONDITIONS).toContain('Guillain-Barré syndrome');
    expect(SPINAL_CORD_CONDITIONS[0]).toBe('Transverse myelitis');
    expect(SPINAL_CORD_CONDITIONS.at(-1)).toBe('Central cord syndrome');
    for (const outside of [
      'Cerebral palsy',
      'Amputee',
      'TBI',
      'Blind/visual',
      'Muscular dystrophy',
    ])
      expect(SPINAL_CORD_CONDITIONS).not.toContain(outside);
  });

  it('labels each kind the way it is said', () => {
    const base = { conditionName: null, exactLevel: null, levelRange: 'Not sure yet' };
    expect(injuryLabel({ ...base, injuryType: 'para', exactLevel: 'T6' })).toBe('T6');
    expect(injuryLabel({ ...base, injuryType: 'para' })).toBe('Para');
    expect(injuryLabel({ ...base, injuryType: 'quad', exactLevel: 'Do not know' })).toBe('Quad');
    expect(injuryLabel({ ...base, injuryType: 'central_cord', exactLevel: 'C5' })).toBe(
      'C5 central cord',
    );
    expect(injuryLabel({ ...base, injuryType: 'central_cord' })).toBe('Central cord syndrome');
    expect(
      injuryLabel({ ...base, injuryType: 'condition', conditionName: 'Transverse myelitis' }),
    ).toBe('Transverse myelitis');
    expect(
      injuryLabel({
        ...base,
        injuryType: 'condition',
        conditionName: 'Spina bifida',
        exactLevel: 'L4',
      }),
    ).toBe('Spina bifida · L4');
    expect(injuryLabel({ ...base, injuryType: 'condition' })).toBe('Other disability');
    expect(injuryLabel({ ...base, injuryType: 'high_para', exactLevel: 'T4' })).toBe('T4');
    expect(injuryLabel({ ...base, injuryType: 'high_para' })).toBe('High para');
    expect(injuryLabel({ ...base, injuryType: 'low_para' })).toBe('Low para');
    expect(injuryLabel({ ...base, injuryType: 'family' })).toBe('Family member');
    expect(injuryLabel({ ...base, injuryType: 'professional' })).toBe('Professional');
  });

  it('reads a member from before the question exactly as before', () => {
    expect(
      injuryLabel({ injuryType: null, conditionName: null, exactLevel: 'C6', levelRange: 'C5–C8' }),
    ).toBe('C6');
    expect(
      injuryLabel({ injuryType: null, conditionName: null, exactLevel: null, levelRange: 'C5–C8' }),
    ).toBe('C5–C8');
  });

  it('starts an older member from their level, and asks completeness of injuries only', () => {
    expect(typeForLevel('C6')).toBe('quad');
    expect(typeForLevel('T4')).toBe('high_para');
    expect(typeForLevel('T8')).toBe('high_para');
    expect(typeForLevel('T9')).toBe('low_para');
    expect(typeForLevel('S2')).toBe('low_para');
    expect(typeForLevel('Do not know')).toBeNull();
    expect(typeForLevel(null)).toBeNull();
    expect(asksCompleteness('para')).toBe(true);
    expect(asksCompleteness(null)).toBe(true);
    expect(asksCompleteness('central_cord')).toBe(false);
    expect(asksCompleteness('condition')).toBe(false);
    expect(asksCompleteness('family')).toBe(false);
    expect(asksCompleteness('professional')).toBe(false);
    expect(asksCompleteness('low_para')).toBe(true);
  });
});
