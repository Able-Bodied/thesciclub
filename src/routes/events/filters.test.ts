import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  dateWindowRange,
  filterEvents,
  isOnline,
  isSport,
  toggleFilter,
  type ViewerEventState,
} from '@/routes/events/filters';
import { makeEvent, makeTag } from '@/test/factory';
import { EMPTY_EVENT_FILTERS, type EventFilters } from '@/types/domain';

/** Mid-afternoon on Saturday 5 September 2026, local time. */
const NOW = new Date(2026, 8, 5, 14, 0, 0);

function viewer(partial: Partial<ViewerEventState> = {}): ViewerEventState {
  return { rsvps: new Map(), dismissed: new Set(), ...partial };
}

function withFilters(overrides: Partial<EventFilters> = {}): EventFilters {
  return { ...EMPTY_EVENT_FILTERS, ...overrides };
}

/** An ISO timestamp `days` from NOW, at noon local time. */
function daysFromNow(days: number): string {
  return new Date(2026, 8, 5 + days, 12, 0, 0).toISOString();
}

describe('dateWindowRange', () => {
  it('starts the week at midnight today, not at now', () => {
    // Otherwise an event that began an hour ago vanishes, and the list appears
    // to lose events as the afternoon goes on.
    const range = dateWindowRange('week', NOW);
    expect(new Date(range?.from ?? '').getHours()).toBe(0);
    expect(new Date(range?.from ?? '').getDate()).toBe(5);
  });

  it('ends the month on the last day of it', () => {
    const range = dateWindowRange('month', NOW);
    expect(new Date(range?.to ?? '').getMonth()).toBe(8);
    expect(new Date(range?.to ?? '').getDate()).toBe(30);
  });

  it('handles February in a leap year without a table', () => {
    const range = dateWindowRange('month', new Date(2028, 1, 10, 9, 0, 0));
    expect(new Date(range?.to ?? '').getDate()).toBe(29);
  });

  it('has no bound at all for "any"', () => {
    expect(dateWindowRange('any', NOW)).toBeNull();
  });

  it('makes past and this-month disjoint', () => {
    const pastEnd = dateWindowRange('past', NOW)?.to ?? '';
    const monthStart = dateWindowRange('month', NOW)?.from ?? '';
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
      filterEvents([earlier], withFilters({ when: 'week' }), 'upcoming', viewer(), NOW),
    ).toHaveLength(1);
  });

  it('drops an event beyond the window', () => {
    const nextYear = makeEvent({ startTime: daysFromNow(400) });
    expect(
      filterEvents([nextYear], withFilters({ when: 'month' }), 'upcoming', viewer(), NOW),
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

  it('hides a dismissed event, and shows it again when asked', () => {
    const event = makeEvent({ id: 'x' });
    const state = viewer({ dismissed: new Set(['x']) });
    expect(filterEvents([event], withFilters(), 'upcoming', state, NOW)).toHaveLength(0);
    expect(
      filterEvents([event], withFilters({ showHidden: true }), 'upcoming', state, NOW),
    ).toHaveLength(1);
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
        filterEvents([faraway], withFilters({ when: 'week' }), 'going', state, NOW),
      ).toHaveLength(1);
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
    expect(activeFilterCount(withFilters({ when: 'week' }))).toBe(1);
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
