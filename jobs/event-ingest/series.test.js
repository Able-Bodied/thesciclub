import { describe, expect, it } from 'vitest';
import {
  editDistance,
  groupIntoSeries,
  normalizeTitle,
  SERIES_THRESHOLD,
  sameSubstantiveWords,
  seriesKeyFor,
  similarity,
} from './series.js';

describe('normalizeTitle', () => {
  it('is case, punctuation and spacing blind', () => {
    expect(normalizeTitle("NorCal SCI's Friday Happy Hour")).toBe('norcal sci s friday happy hour');
    expect(normalizeTitle('  NORCAL   SCI-S  FRIDAY   HAPPY HOUR ')).toBe(
      'norcal sci s friday happy hour',
    );
  });

  it('strips accents rather than treating them as different letters', () => {
    expect(normalizeTitle('Café Meetup')).toBe('cafe meetup');
  });

  it('answers empty for nothing at all', () => {
    expect(normalizeTitle('')).toBe('');
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle('—')).toBe('');
  });
});

describe('editDistance', () => {
  it('counts single edits', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('similarity', () => {
  // The drift this exists for: the same Friday group, written two ways.
  it('rates the apostrophe-s variant as nearly identical', () => {
    const a = normalizeTitle("NorCal SCI's Friday Happy Hour");
    const b = normalizeTitle('NorCal SCI Friday Happy Hour');
    expect(similarity(a, b)).toBeGreaterThan(0.9);
  });

  // And the pair that must stay apart, which shares a longer prefix than the
  // pair above and is the reason the threshold cannot simply be lowered.
  it('keeps two genuinely different events below the threshold', () => {
    const a = normalizeTitle('Wheelchair Rugby Practice');
    const b = normalizeTitle('Wheelchair Rugby Tournament');
    expect(similarity(a, b)).toBeLessThan(SERIES_THRESHOLD);
  });
});

describe('sameSubstantiveWords', () => {
  // Found by running the matcher over the live calendar, not by thinking
  // about it: two teams, one distinct word in a long shared phrase, 0.892
  // similarity — comfortably past a threshold tuned on NorCal SCI's titles.
  it('separates two teams that share the rest of their name', () => {
    const a = normalizeTitle('Bombers Weekly Power Soccer Practice');
    const b = normalizeTitle('Shockers Weekly Power Soccer Practice');
    expect(similarity(a, b)).toBeGreaterThan(SERIES_THRESHOLD);
    expect(sameSubstantiveWords(a, b)).toBe(false);
    expect(seriesKeyFor('Shockers Weekly Power Soccer Practice', [a])).toBe(b);
  });

  // Drift adds and removes grammar; it does not swap the word carrying the
  // meaning. Short tokens are noise on purpose.
  it('ignores a possessive, an article and a preposition', () => {
    expect(
      sameSubstantiveWords(
        normalizeTitle("NorCal SCI's Friday Happy Hour"),
        normalizeTitle('NorCal SCI Friday Happy Hour'),
      ),
    ).toBe(true);
    expect(
      sameSubstantiveWords(
        normalizeTitle('Kayaking Off the Wharf'),
        normalizeTitle('Kayaking Wharf'),
      ),
    ).toBe(true);
  });

  // Checked both ways: dropping a word the other depends on is as much a
  // difference as swapping one in.
  it('notices a missing word as well as a substituted one', () => {
    expect(
      sameSubstantiveWords(
        normalizeTitle('Sacramento Support Group'),
        normalizeTitle('Support Group'),
      ),
    ).toBe(false);
  });
});

describe('seriesKeyFor', () => {
  const happyHour = normalizeTitle("NorCal SCI's Friday Happy Hour");

  it('reuses an existing key for a drifted title', () => {
    expect(seriesKeyFor('NorCal SCI Friday Happy Hour', [happyHour])).toBe(happyHour);
  });

  it('starts a new series for something genuinely different', () => {
    expect(
      seriesKeyFor('Wheelchair Rugby Tournament', [normalizeTitle('Wheelchair Rugby Practice')]),
    ).toBe('wheelchair rugby tournament');
  });

  // Exact matches score 1, so they win without the code having to say so.
  it('prefers an exact match over a close one', () => {
    const keys = ['staying driven wheelchair fitness', 'staying driven wheelchair fitnes'];
    expect(seriesKeyFor('Staying Driven Wheelchair Fitness', keys)).toBe(
      'staying driven wheelchair fitness',
    );
  });

  // series_key is a stored identity. A title equidistant from two series has
  // to land in the same one on every run, or re-ingestion reshuffles rows.
  it('breaks ties the same way every time', () => {
    const keys = ['aaa bbb', 'aaa ccc'];
    const first = seriesKeyFor('aaa ddd', keys);
    const second = seriesKeyFor('aaa ddd', [...keys].reverse());
    expect(first).toBe(second);
  });
});

describe('groupIntoSeries', () => {
  const event = (title, start_time) => ({
    title,
    start_time,
    external_id: `${title}-${start_time}`,
  });

  // The shape of the real calendar: three titles, many occurrences, one of
  // them spelled two ways.
  it('collapses a week of occurrences into one series each', () => {
    const series = groupIntoSeries([
      event("NorCal SCI's Friday Happy Hour", '2026-09-04T00:00:00Z'),
      event("NorCal SCI's Friday Happy Hour", '2026-09-11T00:00:00Z'),
      event('NorCal SCI Friday Happy Hour', '2026-09-18T00:00:00Z'),
      event('Staying Driven Wheelchair Fitness', '2026-09-05T00:00:00Z'),
      event('Staying Driven Wheelchair Fitness', '2026-09-12T00:00:00Z'),
      event('Caregiver MeetUp', '2026-09-06T00:00:00Z'),
    ]);
    expect(series).toHaveLength(3);
    expect(series.map((s) => s.events.length).sort()).toEqual([1, 2, 3]);
  });

  // Display only, and taken from the most recent occurrence: it is what the
  // club's own calendar last called this thing.
  it('represents a series by its most recent title', () => {
    const [series] = groupIntoSeries([
      event("NorCal SCI's Friday Happy Hour", '2026-09-04T00:00:00Z'),
      event('NorCal SCI Friday Happy Hour', '2026-09-18T00:00:00Z'),
    ]);
    expect(series.title).toBe('NorCal SCI Friday Happy Hour');
    // The key is whichever normalised form sorts first, not whichever
    // occurrence happened to arrive first — that is what makes the grouping
    // survive re-ingestion. The representative title moves; the key does not.
    expect(series.key).toBe('norcal sci friday happy hour');
  });

  // The grouping is a stored identity, so it cannot depend on the order the
  // scraper happened to emit rows in.
  it('groups the same way whatever order the events arrive in', () => {
    const events = [
      event("NorCal SCI's Friday Happy Hour", '2026-09-04T00:00:00Z'),
      event('NorCal SCI Friday Happy Hour', '2026-09-18T00:00:00Z'),
      event('Caregiver MeetUp', '2026-09-06T00:00:00Z'),
    ];
    const forwards = groupIntoSeries(events)
      .map((s) => s.key)
      .sort();
    const backwards = groupIntoSeries([...events].reverse())
      .map((s) => s.key)
      .sort();
    expect(forwards).toEqual(backwards);
  });

  it('drops an event whose title normalises to nothing', () => {
    expect(groupIntoSeries([event('—', '2026-09-04T00:00:00Z')])).toEqual([]);
  });
});

// The distribution measured against the live hosted calendar. Worth pinning
// as a fixture: the threshold was tuned on this data, and a change that
// silently merges two of these or splits one is the failure that would be
// hardest to notice from a diff.
describe('the real calendar', () => {
  const counts = [
    ['Staying Driven Wheelchair Fitness', 29],
    ["NorCal SCI's Friday Happy Hour", 16],
    ["The Lionheart Community's Weekly Wednesdays", 16],
    ['Caregiver MeetUp', 7],
    ['Free Monthly Wheelchair Repair Clinic', 4],
    ['Meet Up, UC Davis Rehab Hospital', 4],
    ['Meet Up, Sacramento Rehab Hospital', 4],
    ['Wheel Good Motherhood', 4],
    ['San Luis Obispo Support Group', 4],
    ['Sonoma-Marin SCI Support Group', 4],
    ['Santa Cruz Wheelchair Support Group', 3],
    ['Meet Up, Sutter Rehabilitation Institute, Roseville', 3],
    ['Indoor Rock Climbing Meetups', 2],
    ['Adult Wheelchair Basketball Program', 2],
  ];

  const events = counts.flatMap(([title, n]) =>
    Array.from({ length: n }, (_, i) => ({
      title,
      start_time: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T18:00:00Z`,
      external_id: `${title}-${i}`,
    })),
  );

  it('collapses each repeating event to exactly one series', () => {
    const series = groupIntoSeries(events);
    expect(series).toHaveLength(counts.length);
    expect(series.map((s) => s.events.length).sort((a, b) => b - a)).toEqual(
      counts.map(([, n]) => n).sort((a, b) => b - a),
    );
  });

  // The three Meet Ups differ only by venue and are the closest pairs in the
  // whole calendar, which is what the threshold has to survive.
  it('keeps the two power soccer teams apart', () => {
    const series = groupIntoSeries([
      ...events,
      {
        title: 'Bombers Weekly Power Soccer Practice',
        start_time: '2026-09-02T18:00:00Z',
        external_id: 'b1',
      },
      {
        title: 'Shockers Weekly Power Soccer Practice',
        start_time: '2026-09-09T18:00:00Z',
        external_id: 's1',
      },
    ]);
    expect(series).toHaveLength(counts.length + 2);
  });

  it('keeps the three hospital Meet Ups apart', () => {
    const meetUps = groupIntoSeries(events).filter((s) => s.key.startsWith('meet up'));
    expect(meetUps).toHaveLength(3);
  });

  // And the drift that started all this still joins.
  it('folds the apostrophe-s variant into the existing happy hour', () => {
    const series = groupIntoSeries([
      ...events,
      {
        title: 'NorCal SCI Friday Happy Hour',
        start_time: '2026-10-01T18:00:00Z',
        external_id: 'x',
      },
    ]);
    expect(series).toHaveLength(counts.length);
    const happyHour = series.find((s) => s.key.includes('happy hour'));
    expect(happyHour?.events).toHaveLength(17);
  });
});
