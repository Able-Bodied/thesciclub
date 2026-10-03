import { describe, expect, it } from 'vitest';
import {
  cleanPart,
  type DateParts,
  monthNumber,
  partIsFull,
  partsFromIso,
  readDate,
  splitWholeDate,
} from '@/lib/date-parts';

const NOW = new Date('2026-09-11T12:00:00Z');
const parts = (o: Partial<DateParts>): DateParts => ({ month: '', day: '', year: '', ...o });
const birthday = (o: Partial<DateParts>) => readDate(parts(o), { needs: 'day', now: NOW });
const injury = (o: Partial<DateParts>) => readDate(parts(o), { needs: 'year', now: NOW });

describe('the month', () => {
  it('takes a number with or without its zero', () => {
    expect(monthNumber('5')).toBe(5);
    expect(monthNumber('05')).toBe(5);
  });

  it('takes the name, short or long, in any case', () => {
    expect(monthNumber('May')).toBe(5);
    expect(monthNumber('sept')).toBe(9);
    expect(monthNumber('Dec.')).toBe(12);
    expect(monthNumber('JANUARY')).toBe(1);
  });

  // "Ma" is still March or May, so it is not yet anything.
  it('waits for three letters before reading a name', () => {
    expect(monthNumber('Ma')).toBeNull();
  });

  it('refuses what is no month', () => {
    expect(monthNumber('13')).toBeNull();
    expect(monthNumber('0')).toBeNull();
    expect(monthNumber('Smarch')).toBeNull();
  });
});

describe('a whole date in one box', () => {
  it('spreads the way US dates are written', () => {
    expect(splitWholeDate('5/27/1996')).toEqual({ month: '5', day: '27', year: '1996' });
    expect(splitWholeDate('05-27-1996')).toEqual({ month: '05', day: '27', year: '1996' });
  });

  it('spreads a date as dictation writes it', () => {
    expect(splitWholeDate('May 27th, 1996')).toEqual({ month: 'May', day: '27', year: '1996' });
    expect(splitWholeDate('may 27 1996')).toEqual({ month: 'may', day: '27', year: '1996' });
  });

  it('spreads a year-first date', () => {
    expect(splitWholeDate('1996-05-27')).toEqual({ month: '05', day: '27', year: '1996' });
  });

  it('leaves a single number alone', () => {
    expect(splitWholeDate('1996')).toBeNull();
    expect(splitWholeDate('27')).toBeNull();
    expect(splitWholeDate('Smarch 2 1996')).toBeNull();
  });
});

describe('what a box keeps', () => {
  it('keeps digits only in the day and year, as many as fit', () => {
    expect(cleanPart('day', '2a7')).toBe('27');
    expect(cleanPart('day', '271')).toBe('27');
    expect(cleanPart('year', '19961')).toBe('1996');
  });

  it('lets the month be typed as a number or a name', () => {
    expect(cleanPart('month', '5')).toBe('5');
    expect(cleanPart('month', 'May.')).toBe('May');
  });
});

describe('a box that can take no more', () => {
  it('is full at two digits, or one no second digit could follow', () => {
    expect(partIsFull('month', '12')).toBe(true);
    expect(partIsFull('month', '5')).toBe(true);
    expect(partIsFull('day', '27')).toBe(true);
    expect(partIsFull('day', '4')).toBe(true);
    expect(partIsFull('year', '1996')).toBe(true);
  });

  it('waits on a digit that may still grow', () => {
    expect(partIsFull('month', '1')).toBe(false);
    expect(partIsFull('day', '3')).toBe(false);
    expect(partIsFull('year', '199')).toBe(false);
  });

  // The cursor stays beside a mistake, where its problem is said.
  it('is never full when wrong', () => {
    expect(partIsFull('month', '13')).toBe(false);
    expect(partIsFull('day', '32')).toBe(false);
    expect(partIsFull('day', '00')).toBe(false);
    expect(partIsFull('year', '1066')).toBe(false);
  });

  it('is never full on a month typed as a name', () => {
    expect(partIsFull('month', 'Sept')).toBe(false);
  });
});

describe('a birthday', () => {
  it('is a date once all three are in', () => {
    expect(birthday({ month: '5', day: '27', year: '1996' })).toEqual({
      kind: 'date',
      iso: '1996-05-27',
      precision: 'day',
    });
    expect(birthday({ month: 'May', day: '27', year: '1996' })).toMatchObject({
      iso: '1996-05-27',
    });
  });

  it('is empty, not wrong, before anything is typed', () => {
    expect(birthday({})).toEqual({ kind: 'empty' });
  });

  // Somebody typing 1996 passes through 1, 19 and 199 on the way.
  it('is unfinished, not wrong, while the year is still being typed', () => {
    expect(birthday({ month: '5', day: '27', year: '199' }).kind).toBe('partial');
    expect(birthday({ month: '5', year: '1996' }).kind).toBe('partial');
  });

  it('says plainly when a month cannot be one', () => {
    expect(birthday({ month: '13' })).toMatchObject({ kind: 'invalid', part: 'month' });
  });

  it('says plainly when a day cannot be one', () => {
    expect(birthday({ day: '32' })).toMatchObject({ kind: 'invalid', part: 'day' });
    expect(birthday({ day: '00' })).toMatchObject({ kind: 'invalid', part: 'day' });
  });

  it('names the month when the day is past its end', () => {
    expect(birthday({ month: '4', day: '31', year: '1996' })).toEqual({
      kind: 'invalid',
      part: 'day',
      problem: 'April 1996 has 30 days.',
    });
    expect(birthday({ month: '2', day: '29', year: '1996' }).kind).toBe('date');
    expect(birthday({ month: '2', day: '29', year: '1997' }).kind).toBe('invalid');
  });

  it('refuses a year before anybody living was born', () => {
    expect(birthday({ year: '1066' })).toMatchObject({ kind: 'invalid', part: 'year' });
  });

  it('refuses a date that has not happened', () => {
    expect(birthday({ month: '9', day: '12', year: '2026' }).kind).toBe('invalid');
    expect(birthday({ month: '9', day: '11', year: '2026' }).kind).toBe('date');
  });
});

describe('an injury date', () => {
  it('takes a year alone as a whole answer', () => {
    expect(injury({ year: '2013' })).toEqual({
      kind: 'date',
      iso: '2013-01-01',
      precision: 'year',
    });
  });

  it('records a month when one is given', () => {
    expect(injury({ year: '2013', month: 'March' })).toEqual({
      kind: 'date',
      iso: '2013-03-01',
      precision: 'month',
    });
  });

  it('records a day when the month is there too', () => {
    expect(injury({ year: '2013', month: '3', day: '4' })).toMatchObject({
      iso: '2013-03-04',
      precision: 'day',
    });
  });

  it('leaves out a day with no month, since the year is already an answer', () => {
    expect(injury({ year: '2013', day: '4' })).toMatchObject({ precision: 'year' });
  });

  it('is unfinished without four digits of year', () => {
    expect(injury({ year: '13' })).toEqual({
      kind: 'partial',
      need: 'Add the year, in four digits.',
    });
    expect(injury({ month: '3' }).kind).toBe('partial');
  });

  // Recorded as its first day, which this month's is not after.
  it('accepts this month, not next', () => {
    expect(injury({ year: '2026', month: '9' }).kind).toBe('date');
    expect(injury({ year: '2026', month: '10' }).kind).toBe('invalid');
  });
});

describe('a date already on record', () => {
  it('fills all three boxes from a full date', () => {
    expect(partsFromIso('1996-05-07')).toEqual({ month: '5', day: '7', year: '1996' });
  });

  // Somebody who said "2013" is never shown a January 1st they did not give.
  it('fills only as much as was given', () => {
    expect(partsFromIso('2013-01-01', 'year')).toEqual({ month: '', day: '', year: '2013' });
    expect(partsFromIso('2013-03-01', 'month')).toEqual({ month: '3', day: '', year: '2013' });
  });

  it('leaves the boxes empty with nothing on record', () => {
    expect(partsFromIso(null)).toEqual({ month: '', day: '', year: '' });
    expect(partsFromIso('')).toEqual({ month: '', day: '', year: '' });
  });
});
