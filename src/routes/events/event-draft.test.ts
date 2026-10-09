import { describe, expect, it } from 'vitest';
import {
  draftFromEvent,
  type EventDraft,
  emptyDraft,
  hostOptions,
  mayAddEvents,
  mayChangeEvent,
  NO_ORGANIZATION,
  readDraft,
  readLink,
  readTime,
  timeText,
  wallTimeToIso,
} from '@/routes/events/event-draft';
import { makeEvent, makeOrganization } from '@/test/factory';

const PACIFIC = 'America/Los_Angeles';
const NOW = new Date('2026-10-05T12:00:00Z');

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    ...emptyDraft('org-1'),
    title: 'Picnic',
    date: { month: '10', day: '20', year: '2026' },
    startTime: '12 pm',
    format: 'in_person',
    location: 'Lake Merritt',
    ...overrides,
  };
}

describe('who may', () => {
  it('shows Add to an administrator and to a member who speaks for an organization', () => {
    expect(mayAddEvents(true, new Set())).toBe(true);
    expect(mayAddEvents(false, new Set(['org-1']))).toBe(true);
    expect(mayAddEvents(false, new Set())).toBe(false);
  });

  it('never offers to change a scraped event, even to an administrator', () => {
    const scraped = makeEvent({ handAdded: false, organizationId: 'org-1' });
    expect(mayChangeEvent(scraped, true, new Set(['org-1']))).toBe(false);
  });

  it('offers a hand-added event to its organization and to administrators only', () => {
    const theirs = makeEvent({ handAdded: true, organizationId: 'org-1' });
    const community = makeEvent({
      handAdded: true,
      organizationId: null,
      hostName: 'The SCI Club',
    });
    expect(mayChangeEvent(theirs, false, new Set(['org-1']))).toBe(true);
    expect(mayChangeEvent(theirs, false, new Set(['org-2']))).toBe(false);
    expect(mayChangeEvent(community, false, new Set(['org-1']))).toBe(false);
    expect(mayChangeEvent(community, true, new Set())).toBe(true);
  });

  it('lists every organization for an administrator and only their own for anybody else', () => {
    const all = [makeOrganization({ id: 'org-1' }), makeOrganization({ id: 'org-2' })];
    expect(hostOptions(all, true, new Set()).map((o) => o.id)).toEqual(['org-1', 'org-2']);
    expect(hostOptions(all, false, new Set(['org-2'])).map((o) => o.id)).toEqual(['org-2']);
  });
});

describe('readTime', () => {
  it.each([
    ['7pm', 19, 0],
    ['7 PM', 19, 0],
    ['7:30 pm', 19, 30],
    ['7.30 p.m.', 19, 30],
    ['12 pm', 12, 0],
    ['12:15 am', 0, 15],
    ['9a', 9, 0],
    ['19:00', 19, 0],
    ['0:30', 0, 30],
    ['noon', 12, 0],
    ['midnight', 0, 0],
  ])('reads %s', (text, hour, minute) => {
    expect(readTime(text)).toEqual({ kind: 'time', time: { hour, minute } });
  });

  it('asks for am or pm rather than guessing a morning', () => {
    expect(readTime('7:30')).toEqual({ kind: 'invalid', problem: 'Add am or pm.' });
  });

  it('refuses what is not a time', () => {
    expect(readTime('7:75 pm').kind).toBe('invalid');
    expect(readTime('13 pm').kind).toBe('invalid');
    expect(readTime('soon').kind).toBe('invalid');
    expect(readTime('  ')).toEqual({ kind: 'empty' });
  });

  it('shows a time back the way it reads', () => {
    expect(timeText(19, 5)).toBe('7:05 pm');
    expect(timeText(0, 0)).toBe('12:00 am');
    expect(timeText(12, 30)).toBe('12:30 pm');
  });
});

describe('wallTimeToIso', () => {
  it('reads a Pacific time in daylight saving and out of it', () => {
    expect(wallTimeToIso({ year: 2026, month: 7, day: 1 }, { hour: 18, minute: 30 }, PACIFIC)).toBe(
      '2026-07-02T01:30:00.000Z',
    );
    expect(
      wallTimeToIso({ year: 2026, month: 12, day: 1 }, { hour: 18, minute: 30 }, PACIFIC),
    ).toBe('2026-12-02T02:30:00.000Z');
  });

  it('settles on the right side of the November change', () => {
    // 1 November 2026 is the day the clocks go back; noon is in standard time.
    expect(wallTimeToIso({ year: 2026, month: 11, day: 1 }, { hour: 12, minute: 0 }, PACIFIC)).toBe(
      '2026-11-01T20:00:00.000Z',
    );
    // A first guess for 3 am lands in daylight time and is an hour out; only
    // the second correction gets it right.
    expect(wallTimeToIso({ year: 2026, month: 11, day: 1 }, { hour: 3, minute: 0 }, PACIFIC)).toBe(
      '2026-11-01T11:00:00.000Z',
    );
  });
});

describe('readLink', () => {
  it('gives a bare address its https and keeps a whole one', () => {
    expect(readLink('norcalsci.org/picnic')).toEqual({
      ok: true,
      url: 'https://norcalsci.org/picnic',
    });
    expect(readLink('http://example.org')).toEqual({ ok: true, url: 'http://example.org' });
    expect(readLink('')).toEqual({ ok: true, url: '' });
  });

  it('refuses anything a browser would run, or that is not an address', () => {
    expect(readLink('javascript:alert(1)').ok).toBe(false);
    expect(readLink('call us').ok).toBe(false);
  });
});

describe('readDraft', () => {
  it('turns a filled form into what save_event takes, in Pacific time', () => {
    const reading = readDraft(draft({ endTime: '3 pm', url: 'norcalsci.org' }), {
      isNew: true,
      now: NOW,
    });
    expect(reading).toEqual({
      ok: true,
      payload: {
        organizationId: 'org-1',
        hostName: '',
        title: 'Picnic',
        description: '',
        startTime: '2026-10-20T19:00:00.000Z',
        endTime: '2026-10-20T22:00:00.000Z',
        format: 'in_person',
        location: 'Lake Merritt',
        city: '',
        url: 'https://norcalsci.org',
        registrationUrl: '',
      },
    });
  });

  it('carries an end earlier on the clock into the next morning', () => {
    const reading = readDraft(draft({ startTime: '9 pm', endTime: '1 am' }), {
      isNew: true,
      now: NOW,
    });
    expect(reading.ok && reading.payload.endTime).toBe('2026-10-21T08:00:00.000Z');
  });

  it('needs a host named when no organization hosts it', () => {
    expect(readDraft(draft({ host: NO_ORGANIZATION }), { isNew: true, now: NOW })).toEqual({
      ok: false,
      problem: 'Say who is hosting it.',
    });
    const named = readDraft(draft({ host: NO_ORGANIZATION, hostName: ' The SCI Club ' }), {
      isNew: true,
      now: NOW,
    });
    expect(named.ok && named.payload).toMatchObject({
      organizationId: null,
      hostName: 'The SCI Club',
    });
  });

  it('starts with nothing chosen when there is more than one host to choose', () => {
    expect(readDraft({ ...draft(), host: '' }, { isNew: true, now: NOW })).toEqual({
      ok: false,
      problem: 'Choose who is hosting it.',
    });
  });

  it('refuses a new event in the past but lets an old one be corrected', () => {
    const past = draft({ date: { month: '9', day: '1', year: '2026' } });
    expect(readDraft(past, { isNew: true, now: NOW })).toEqual({
      ok: false,
      problem: 'That time has already passed.',
    });
    expect(readDraft(past, { isNew: false, now: NOW }).ok).toBe(true);
  });

  it('asks where an in-person event is, and not an online one', () => {
    expect(readDraft(draft({ location: ' ' }), { isNew: true, now: NOW })).toEqual({
      ok: false,
      problem: 'Say where it is.',
    });
    expect(readDraft(draft({ location: '', format: 'online' }), { isNew: true, now: NOW }).ok).toBe(
      true,
    );
  });

  it('says which time is wrong', () => {
    expect(readDraft(draft({ endTime: '4:30' }), { isNew: true, now: NOW })).toEqual({
      ok: false,
      problem: 'Ends: Add am or pm.',
    });
  });
});

describe('draftFromEvent', () => {
  it('shows an event back as it was typed, in its own zone', () => {
    const event = makeEvent({
      handAdded: true,
      organizationId: null,
      hostName: 'The SCI Club',
      startTime: '2026-10-20T19:00:00.000Z',
      endTime: '2026-10-20T22:00:00.000Z',
      timezone: PACIFIC,
    });
    expect(draftFromEvent(event)).toMatchObject({
      host: NO_ORGANIZATION,
      hostName: 'The SCI Club',
      date: { month: '10', day: '20', year: '2026' },
      startTime: '12:00 pm',
      endTime: '3:00 pm',
    });
  });
});

describe('daylight-saving boundaries', () => {
  it.each([
    { startTime: '2:30 am', endTime: '' },
    { startTime: '1:30 am', endTime: '2:30 am' },
  ])('rejects a nonexistent start or end (%o)', (times) => {
    const reading = readDraft(draft({ date: { year: '2027', month: '3', day: '14' }, ...times }), {
      isNew: true,
      now: NOW,
    });
    expect(reading.ok).toBe(false);
    if (!reading.ok) expect(reading.problem).toMatch(/clock.*forward/i);
  });
  it('rejects a nonexistent end on the following morning', () => {
    expect(
      readDraft(
        draft({
          date: { year: '2027', month: '3', day: '13' },
          startTime: '11 pm',
          endTime: '2:30 am',
        }),
        { isNew: true, now: NOW },
      ).ok,
    ).toBe(false);
  });
  it('chooses the first occurrence of a repeated autumn time', () => {
    expect(wallTimeToIso({ year: 2027, month: 11, day: 7 }, { hour: 1, minute: 30 }, PACIFIC)).toBe(
      '2027-11-07T08:30:00.000Z',
    );
  });
});
