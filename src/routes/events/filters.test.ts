import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  dateWindowRange,
  filterEvents,
  isOnline,
  isPastEvent,
  isSport,
  toggleFilter,
  type ViewerEventState,
} from '@/routes/events/filters';
import { makeEvent, makeTag } from '@/test/factory';
import { EMPTY_EVENT_FILTERS, type EventFilters } from '@/types/domain';

/** Mid-afternoon on Saturday 5 September 2026, local time. */
const NOW = new Date(2026, 8, 5, 14, 0, 0);

function viewer(partial: Partial<ViewerEventState> = {}): ViewerEventState {
  return { rsvps: new Map(), ...partial };
}

function withFilters(overrides: Partial<EventFilters> = {}): EventFilters {
  return { ...EMPTY_EVENT_FILTERS, ...overrides };
}

/** An ISO timestamp `days` from NOW, at noon local time. */
function daysFromNow(days: number): string {
  return new Date(2026, 8, 5 + days, 12, 0, 0).toISOString();
}

describe('dateWindowRange', () => {
  it('starts at midnight today, not at now', () => {
    // Otherwise an event that began an hour ago vanishes, and the list appears
    // to lose events as the afternoon goes on.
    const range = dateWindowRange('next7', NOW);
    expect(new Date(range?.from ?? '').getHours()).toBe(0);
    expect(new Date(range?.from ?? '').getDate()).toBe(5);
  });

  it('spans the same number of days whenever it is asked', () => {
    // The bug this replaced: the long window ran to the end of the calendar
    // month, so the default view held twenty days of events on the 11th and one
    // day on the 30th — while a full next month sat just outside it.
    const spanInDays = (when: 'next7' | 'next30', day: number) => {
      const now = new Date(2026, 8, day, 14, 0, 0);
      const range = dateWindowRange(when, now);
      const from = new Date(range?.from ?? '').getTime();
      const to = new Date(range?.to ?? '').getTime();
      return Math.round((to - from) / 86_400_000);
    };
    for (const day of [1, 11, 20, 28, 30]) {
      expect(spanInDays('next30', day)).toBe(30);
      expect(spanInDays('next7', day)).toBe(7);
    }
  });

  it('crosses a month boundary rather than stopping at it', () => {
    // Asked on 28 September, "next 30 days" reaches well into October.
    const range = dateWindowRange('next30', new Date(2026, 8, 28, 14, 0, 0));
    expect(new Date(range?.to ?? '').getMonth()).toBe(9);
  });

  it('crosses a year boundary too', () => {
    const range = dateWindowRange('next30', new Date(2026, 11, 20, 9, 0, 0));
    expect(new Date(range?.to ?? '').getFullYear()).toBe(2027);
  });

  it('has no bound at all for "any"', () => {
    expect(dateWindowRange('any', NOW)).toBeNull();
  });

  it('makes past and this-month disjoint', () => {
    const pastEnd = dateWindowRange('past', NOW)?.to ?? '';
    const monthStart = dateWindowRange('next30', NOW)?.from ?? '';
    expect(pastEnd).not.toBe('');
    expect(monthStart).not.toBe('');
    // Past ends strictly before the forward window opens, so no event is in both.
    expect(pastEnd.localeCompare(monthStart)).toBeLessThan(0);
  });
});

describe('filterEvents', () => {
  it('keeps an event that started earlier today', () => {
    const earlier = makeEvent({ startTime: new Date(2026, 8, 5, 13, 0, 0).toISOString() });
    expect(
      filterEvents([earlier], withFilters({ when: 'next7' }), 'upcoming', viewer(), NOW),
    ).toHaveLength(1);
  });

  it('drops an event beyond the window', () => {
    const nextYear = makeEvent({ startTime: daysFromNow(400) });
    expect(
      filterEvents([nextYear], withFilters({ when: 'next30' }), 'upcoming', viewer(), NOW),
    ).toHaveLength(0);
  });

  it('sorts soonest first', () => {
    const later = makeEvent({ id: 'later', startTime: daysFromNow(5) });
    const sooner = makeEvent({ id: 'sooner', startTime: daysFromNow(1) });
    const result = filterEvents([later, sooner], withFilters(), 'upcoming', viewer(), NOW);
    expect(result.map((e) => e.id)).toEqual(['sooner', 'later']);
  });

  it('sorts past events newest first', () => {
    const old = makeEvent({ id: 'old', startTime: daysFromNow(-40) });
    const recent = makeEvent({ id: 'recent', startTime: daysFromNow(-2) });
    const result = filterEvents(
      [old, recent],
      withFilters({ when: 'past' }),
      'upcoming',
      viewer(),
      NOW,
    );
    expect(result.map((e) => e.id)).toEqual(['recent', 'old']);
  });

  describe('empty selections mean "do not narrow", never "match nothing"', () => {
    const events = [makeEvent({ city: 'San Jose' }), makeEvent({ city: 'Santa Cruz' })];

    it('keeps everything when no city is ticked', () => {
      expect(
        filterEvents(events, withFilters({ cities: [] }), 'upcoming', viewer(), NOW),
      ).toHaveLength(2);
    });

    it('narrows when one is', () => {
      const result = filterEvents(
        events,
        withFilters({ cities: ['San Jose'] }),
        'upcoming',
        viewer(),
        NOW,
      );
      expect(result.map((e) => e.city)).toEqual(['San Jose']);
    });

    it('ORs several rather than ANDing them', () => {
      const result = filterEvents(
        events,
        withFilters({ cities: ['San Jose', 'Santa Cruz'] }),
        'upcoming',
        viewer(),
        NOW,
      );
      expect(result).toHaveLength(2);
    });
  });

  it('matches an event carrying any one of the selected tags', () => {
    const rugby = makeEvent({ tags: [makeTag('wheelchair-rugby')] });
    const coffee = makeEvent({ tags: [makeTag('peer-support', 'support')] });
    const result = filterEvents(
      [rugby, coffee],
      withFilters({ tags: ['wheelchair-rugby', 'travel'] }),
      'upcoming',
      viewer(),
      NOW,
    );
    expect(result).toEqual([rugby]);
  });

  describe('segments', () => {
    it('"going" shows only what the viewer said they are going to', () => {
      const going = makeEvent({ id: 'a' });
      const interested = makeEvent({ id: 'b' });
      const state = viewer({
        rsvps: new Map([
          ['a', 'going' as const],
          ['b', 'interested' as const],
        ]),
      });
      const result = filterEvents([going, interested], withFilters(), 'going', state, NOW);
      expect(result.map((e) => e.id)).toEqual(['a']);
    });

    it('"going" ignores the date window', () => {
      // Somebody checking what they have committed to means all of it. A trip
      // four months out must not vanish because the window says "this week".
      const faraway = makeEvent({ id: 'trip', startTime: daysFromNow(120) });
      const state = viewer({ rsvps: new Map([['trip', 'going' as const]]) });
      expect(
        filterEvents([faraway], withFilters({ when: 'next7' }), 'going', state, NOW),
      ).toHaveLength(1);
    });

    it('"going" puts what is over below what is coming, not above it', () => {
      // The bug this pins: a flat ascending sort left an event from August at
      // the top of the list for ever, so the first thing a member saw under
      // "I'm going" was something they had already been to.
      const lastMonth = makeEvent({ id: 'last-month', startTime: daysFromNow(-30) });
      const lastWeek = makeEvent({ id: 'last-week', startTime: daysFromNow(-7) });
      const tomorrow = makeEvent({ id: 'tomorrow', startTime: daysFromNow(1) });
      const nextMonth = makeEvent({ id: 'next-month', startTime: daysFromNow(30) });
      const state = viewer({
        rsvps: new Map([
          ['last-month', 'going' as const],
          ['last-week', 'going' as const],
          ['tomorrow', 'going' as const],
          ['next-month', 'going' as const],
        ]),
      });

      const result = filterEvents(
        [lastMonth, lastWeek, tomorrow, nextMonth],
        withFilters(),
        'going',
        state,
        NOW,
      );

      // Upcoming soonest-first, then past most-recent-first.
      expect(result.map((e) => e.id)).toEqual([
        'tomorrow',
        'next-month',
        'last-week',
        'last-month',
      ]);
    });

    it('"interested" splits the same way, and keeps ignoring the window', () => {
      const yesterday = makeEvent({ id: 'yesterday', startTime: daysFromNow(-1) });
      const faraway = makeEvent({ id: 'faraway', startTime: daysFromNow(120) });
      const state = viewer({
        rsvps: new Map([
          ['yesterday', 'interested' as const],
          ['faraway', 'interested' as const],
        ]),
      });

      const result = filterEvents(
        [yesterday, faraway],
        withFilters({ when: 'next7' }),
        'interested',
        state,
        NOW,
      );

      expect(result.map((e) => e.id)).toEqual(['faraway', 'yesterday']);
    });

    it('"sport" takes the whole category, not one tag', () => {
      const rugby = makeEvent({ tags: [makeTag('wheelchair-rugby', 'sport')] });
      const kayak = makeEvent({ tags: [makeTag('kayaking', 'sport')] });
      const coffee = makeEvent({ tags: [makeTag('peer-support', 'support')] });
      expect(
        filterEvents([rugby, kayak, coffee], withFilters(), 'sport', viewer(), NOW),
      ).toHaveLength(2);
    });

    it('"online" includes hybrid', () => {
      // "Online" asks "can I be at this without getting there". Hybrid says yes.
      const online = makeEvent({ format: 'online' });
      const hybrid = makeEvent({ format: 'hybrid' });
      const inPerson = makeEvent({ format: 'in_person' });
      expect(
        filterEvents([online, hybrid, inPerson], withFilters(), 'online', viewer(), NOW),
      ).toHaveLength(2);
    });
  });

  it('excludes an event of unknown format when a format is selected', () => {
    // Null is "we could not tell", which is not a claim that it is in person.
    const unknown = makeEvent({ format: null });
    expect(
      filterEvents([unknown], withFilters({ formats: ['in_person'] }), 'upcoming', viewer(), NOW),
    ).toHaveLength(0);
  });
});

describe('isOnline / isSport', () => {
  it('treat hybrid as online', () => {
    expect(isOnline(makeEvent({ format: 'hybrid' }))).toBe(true);
  });
  it('do not treat a support group as sport', () => {
    expect(isSport(makeEvent({ tags: [makeTag('peer-support', 'support')] }))).toBe(false);
  });
});

describe('activeFilterCount', () => {
  it('is zero for the defaults', () => {
    expect(activeFilterCount(EMPTY_EVENT_FILTERS)).toBe(0);
  });

  it('counts a non-default window as one', () => {
    expect(activeFilterCount(withFilters({ when: 'next7' }))).toBe(1);
  });

  it('counts each selected value', () => {
    expect(
      activeFilterCount(withFilters({ cities: ['San Jose'], tags: ['travel', 'kayaking'] })),
    ).toBe(3);
  });
});

describe('toggleFilter', () => {
  it('adds then removes', () => {
    const once = toggleFilter(EMPTY_EVENT_FILTERS, 'cities', 'San Jose');
    expect(once.cities).toEqual(['San Jose']);
    expect(toggleFilter(once, 'cities', 'San Jose').cities).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = withFilters({ cities: ['San Jose'] });
    toggleFilter(before, 'cities', 'Santa Cruz');
    expect(before.cities).toEqual(['San Jose']);
  });
});

describe('the interested segment', () => {
  const said = viewer({
    rsvps: new Map<string, 'interested' | 'going'>([
      ['a', 'interested'],
      ['b', 'going'],
    ]),
  });

  it('lists what the viewer marked interested, and nothing else', () => {
    const events = [makeEvent({ id: 'a' }), makeEvent({ id: 'b' }), makeEvent({ id: 'c' })];
    expect(filterEvents(events, EMPTY_EVENT_FILTERS, 'interested', said).map((e) => e.id)).toEqual([
      'a',
    ]);
  });

  it('ignores the date window, like "I am going" does', () => {
    // Somebody checking what they were weighing up means all of it. A list
    // that dropped next month's trip because the window says "this week" is
    // answering a question they did not ask.
    const now = new Date('2026-09-11T12:00:00Z');
    const nextYear = makeEvent({ id: 'a', startTime: '2027-09-11T17:00:00Z' });
    expect(
      filterEvents([nextYear], { ...EMPTY_EVENT_FILTERS, when: 'next7' }, 'interested', said, now),
    ).toHaveLength(1);
  });
});

describe('isPastEvent', () => {
  it('counts an event earlier today as still current', () => {
    // The boundary is the start of today, not `now`: somebody checking at 2pm
    // has not missed a thing that began at 1pm.
    const oneThisAfternoon = makeEvent({ startTime: new Date(2026, 8, 5, 13, 0, 0).toISOString() });
    expect(isPastEvent(oneThisAfternoon, NOW)).toBe(false);
  });

  it('counts yesterday as past', () => {
    expect(isPastEvent(makeEvent({ startTime: daysFromNow(-1) }), NOW)).toBe(true);
  });

  it('counts tomorrow as not past', () => {
    expect(isPastEvent(makeEvent({ startTime: daysFromNow(1) }), NOW)).toBe(false);
  });
});
