import { act, render, renderHook, waitFor } from '@testing-library/react';
import { Activity } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useChatAuthors } from '@/lib/chat/authors';
import { HOME_TOPIC_LIMIT, useHomeTopics } from '@/lib/home/topics';
import { keptReadsStale } from '@/lib/kept-reads';

const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  includeHidden: false,
  includeClosed: false,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const query = {
        select: (columns: string) => {
          db.calls.push(['select', columns]);
          return query;
        },
        eq: (column: string, value: unknown) => {
          db.calls.push(['eq', column, value]);
          if (column === 'chat_rooms.show_in_home' && value === true) db.includeHidden = false;
          return query;
        },
        not: (column: string, operator: string, value: unknown) => {
          db.calls.push(['not', column, operator, value]);
          if (column === 'chat_rooms.opened_at' && operator === 'is' && value === null)
            db.includeClosed = false;
          return query;
        },
        order: () => query,
        limit: (count: number) => {
          db.calls.push(['limit', count]);
          return query;
        },
        in: () => query,
        is: () => query,
        abortSignal: () =>
          Promise.resolve({
            data:
              table === 'chat_topics'
                ? [
                    {
                      id:
                        db.includeHidden || db.includeClosed
                          ? 'excluded-newest-topic'
                          : 'eligible-topic',
                      room_id: 'bowel',
                      title: 'Eligible topic',
                      author_id: 'a1',
                      author: {
                        id: 'a1',
                        display_name: 'Ana',
                        photo_path: null,
                        photo_alt: null,
                        avatar_color: null,
                        level_range: 'C5–C8',
                        exact_level: null,
                        is_admin: false,
                        has_profile: true,
                      },
                      created_at: '2026-10-10T10:00:00Z',
                      last_post_at: '2026-10-10T10:00:00Z',
                      reply_count: 0,
                    },
                  ]
                : [],
            error: null,
          }),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  db.calls = [];
  db.includeHidden = true;
  db.includeClosed = true;
});

it('requests only eligible rooms before limiting Home topics, including for an admin', async () => {
  const { result } = renderHook(() => useHomeTopics());
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  expect(result.current.error).toBeNull();
  expect(result.current.topics.map((t) => t.id)).toEqual(['eligible-topic']);
  expect(db.calls[0]?.[1]).toContain('chat_rooms!inner');
  expect(db.calls.slice(1, 4)).toEqual([
    ['eq', 'chat_rooms.show_in_home', true],
    ['not', 'chat_rooms.opened_at', 'is', null],
    ['limit', HOME_TOPIC_LIMIT],
  ]);
});

it('brings the cards’ names and faces in the same read, ready on the first render', async () => {
  // As Home asks: the authors of whatever topics have arrived.
  const unnamed: string[] = [];
  const { result } = renderHook(() => {
    const read = useHomeTopics();
    const authors = useChatAuthors(read.topics.map((topic) => topic.authorId));
    for (const topic of read.topics) {
      if (topic.authorId && !authors.has(topic.authorId)) unnamed.push(topic.id);
    }
    return { read, authors };
  });
  await waitFor(() => {
    expect(result.current.read.loading).toBe(false);
  });
  expect(db.calls[0]?.[1]).toContain('author:chat_authors!chat_topics_author_id_fkey(');
  expect(db.calls[0]?.[1]).toContain('author:chat_authors!chat_posts_author_id_fkey(');
  expect(result.current.authors.get('a1')?.displayName).toBe('Ana');
  // Never a render with the topic and not its author.
  expect(unnamed).toEqual([]);
  // And nothing read for an author already known.
  expect(db.calls.filter(([kind]) => kind === 'select')).toHaveLength(1);
});

// From 2026-11-18's filter until this, every read blanked Home to its
// placeholders, also the one a kept tab makes when it is shown again after a
// minute: the owner saw Home go empty for over a second each time he came back.
it('keeps its cards while it reads the same choice again', async () => {
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useHomeTopics().loading);
    return null;
  }
  const tab = (mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>
      <Probe />
    </Activity>
  );
  const reads = () => db.calls.filter(([kind]) => kind === 'select').length;
  const { rerender } = render(tab('visible'));
  await waitFor(() => {
    expect(seen.at(-1)).toBe(false);
  });
  expect(reads()).toBe(1);

  seen.length = 0;
  rerender(tab('hidden'));
  act(() => {
    keptReadsStale();
  });
  rerender(tab('visible'));
  await waitFor(() => {
    expect(reads()).toBe(2);
  });
  expect(seen).not.toContain(true);
});
