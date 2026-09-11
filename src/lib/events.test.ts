import { describe, expect, it } from 'vitest';
import { buildTaxonomy, toEvents } from '@/lib/events';

const TAG_ROWS = [
  { id: 'cat-sport', slug: 'sport', name: 'Sport & recreation', parent_id: null },
  { id: 'tag-rugby', slug: 'wheelchair-rugby', name: 'Wheelchair rugby', parent_id: 'cat-sport' },
  { id: 'tag-kayak', slug: 'kayaking', name: 'Kayaking', parent_id: 'cat-sport' },
];

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: 'Rugby',
    description: '',
    description_html: '',
    start_time: '2026-09-05T17:00:00Z',
    end_time: null,
    location: 'Court',
    city: 'San Jose',
    url: null,
    registration_url: null,
    event_format: 'in_person',
    organization_id: null,
    host_name: null,
    feed_id: 'feed-1',
    ...overrides,
  };
}

function join(overrides: Partial<Parameters<typeof toEvents>[0]> = {}) {
  return toEvents({
    events: [eventRow()],
    eventTags: [],
    taxonomy: buildTaxonomy(TAG_ROWS),
    counts: [],
    timezones: new Map([['feed-1', 'America/Los_Angeles']]),
    ...overrides,
  });
}

describe('buildTaxonomy', () => {
  it('flattens a tag onto its category', () => {
    const taxonomy = buildTaxonomy(TAG_ROWS);
    expect(taxonomy.get('tag-rugby')).toEqual({
      slug: 'wheelchair-rugby',
      name: 'Wheelchair rugby',
      categorySlug: 'sport',
      categoryName: 'Sport & recreation',
    });
  });

  it('omits categories themselves — they are never applied to an event', () => {
    expect(buildTaxonomy(TAG_ROWS).has('cat-sport')).toBe(false);
  });
});

describe('toEvents', () => {
  it('attaches an event’s tags', () => {
    const [event] = join({ eventTags: [{ event_id: 'e1', tag_id: 'tag-rugby' }] });
    expect(event?.tags.map((t) => t.slug)).toEqual(['wheelchair-rugby']);
  });

  it('sorts tags so chips do not reshuffle between renders', () => {
    const [event] = join({
      eventTags: [
        { event_id: 'e1', tag_id: 'tag-rugby' },
        { event_id: 'e1', tag_id: 'tag-kayak' },
      ],
    });
    expect(event?.tags.map((t) => t.name)).toEqual(['Kayaking', 'Wheelchair rugby']);
  });

  it('ignores a tag link the taxonomy does not know', () => {
    const [event] = join({ eventTags: [{ event_id: 'e1', tag_id: 'nope' }] });
    expect(event?.tags).toEqual([]);
  });

  it('reads a missing counts row as zero, not as undefined', () => {
    // The view omits events nobody has RSVPed to, rather than emitting zeroes.
    const [event] = join({ counts: [] });
    expect(event?.goingCount).toBe(0);
    expect(event?.interestedCount).toBe(0);
  });

  it('takes the counts when there are some', () => {
    const [event] = join({
      counts: [{ event_id: 'e1', going_count: 3, interested_count: 5 }],
    });
    expect(event?.goingCount).toBe(3);
    expect(event?.interestedCount).toBe(5);
  });

  it('does not give one event another’s tags or counts', () => {
    const events = join({
      events: [eventRow(), eventRow({ id: 'e2' })],
      eventTags: [{ event_id: 'e2', tag_id: 'tag-kayak' }],
      counts: [{ event_id: 'e2', going_count: 9, interested_count: 0 }],
    });
    expect(events[0]?.tags).toEqual([]);
    expect(events[0]?.goingCount).toBe(0);
    expect(events[1]?.tags.map((t) => t.slug)).toEqual(['kayaking']);
    expect(events[1]?.goingCount).toBe(9);
  });

  it('takes each event’s timezone from its own feed', () => {
    const events = join({
      events: [eventRow(), eventRow({ id: 'e2', feed_id: 'feed-2' })],
      timezones: new Map([
        ['feed-1', 'America/Los_Angeles'],
        ['feed-2', 'America/Denver'],
      ]),
    });
    expect(events.map((e) => e.timezone)).toEqual(['America/Los_Angeles', 'America/Denver']);
  });

  it('falls back to Pacific rather than rendering nothing for an unknown feed', () => {
    const [event] = join({ timezones: new Map() });
    expect(event?.timezone).toBe('America/Los_Angeles');
  });
});
