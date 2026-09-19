import { useEffect, useState } from 'react';
import type { ChatAuthor } from '@/lib/chat/types';
import { getSupabase } from '@/lib/supabase';

/**
 * Putting a name to somebody who wrote something.
 *
 * ---------------------------------------------------------------------------
 * Why this is not useBrowseMembers
 * ---------------------------------------------------------------------------
 * `browse_members` is the deck of people to meet: it hides members who turned
 * themselves off the directory and members who are not active. That is right
 * for a deck and wrong for a post. Somebody who wrote forty posts and then hid
 * themselves has not unwritten them, and through browse_members every one of
 * those posts would render as nobody.
 *
 * So this reads `chat_authors`, which carries every member row regardless, and
 * carries only enough to print a byline — a name, an avatar, a level. The
 * `hasProfile` flag is the view's own, and it is what decides whether the
 * avatar links to /peers/:id. The client must not work that out from the
 * columns itself, or the day the directory rule changes there will be two
 * rules.
 *
 * A null author is not in here at all: that is a removed member, and the
 * screens render "Former member" rather than looking anybody up.
 *
 * ---------------------------------------------------------------------------
 * The cache is module-level on purpose
 * ---------------------------------------------------------------------------
 * A topic screen asks for six authors, the room list asks for four more, and
 * walking back and forth between them would re-read the same handful of rows on
 * every navigation. Names do not change while somebody is reading a thread, and
 * a stale display name for the length of a session is a smaller problem than a
 * request per screen.
 *
 * It is a cache and not a store: a miss is fetched, a hit is not, and nothing
 * invalidates. `resetChatAuthors()` exists for tests, which would otherwise
 * leak one file's fixtures into the next — a failure mode this project has
 * already had with Testing Library renders.
 */

const cache = new Map<string, ChatAuthor>();
/** Ids asked for and answered with nothing: a member row that no longer exists.
 *  Remembered so a missing author is not re-requested on every render. */
const missing = new Set<string>();

export function resetChatAuthors(): void {
  cache.clear();
  missing.clear();
}

interface ChatAuthorRow {
  id: string;
  display_name: string;
  photo_path: string | null;
  photo_alt: string | null;
  avatar_color: string | null;
  level_range: string | null;
  exact_level: string | null;
  is_admin: boolean;
  has_profile: boolean;
}

function toAuthor(row: ChatAuthorRow): ChatAuthor {
  return {
    id: row.id,
    displayName: row.display_name,
    photoPath: row.photo_path,
    photoAlt: row.photo_alt,
    avatarColor: row.avatar_color,
    // The exact level when they gave one, the range otherwise — the same
    // choice member-card.tsx makes, so the same person reads the same way on
    // a post as on their card.
    level: row.exact_level ?? row.level_range,
    isAdmin: row.is_admin,
    hasProfile: row.has_profile,
  };
}

/**
 * Read a set of authors, whatever is not already known.
 *
 * Exported for the one caller that needs authors outside a component.
 */
export async function fetchChatAuthors(ids: string[]): Promise<Map<string, ChatAuthor>> {
  const wanted = [...new Set(ids)].filter((id) => !cache.has(id) && !missing.has(id));
  if (wanted.length > 0) {
    const { data, error } = await getSupabase()
      .from('chat_authors')
      .select(
        'id, display_name, photo_path, photo_alt, avatar_color, level_range, exact_level, is_admin, has_profile',
      )
      .in('id', wanted);
    // A failure leaves the ids uncached, so the next render tries again. The
    // screens draw an unnamed tile meanwhile, which is what they draw for a
    // removed member — wrong for a moment rather than broken.
    if (!error) {
      for (const row of data as ChatAuthorRow[]) cache.set(row.id, toAuthor(row));
      for (const id of wanted) if (!cache.has(id)) missing.add(id);
    }
  }
  return new Map(cache);
}

/**
 * The authors behind a set of ids, as a map, filling in as they arrive.
 *
 * Callers pass whatever ids they have and read `byId.get(id) ?? null`. Nulls
 * and unknowns are the same thing to them: both render as "Former member".
 */
export function useChatAuthors(ids: (string | null)[]): Map<string, ChatAuthor> {
  const [byId, setById] = useState<Map<string, ChatAuthor>>(() => new Map(cache));

  // The identity of `ids` changes on every render of the caller, so the effect
  // is keyed on the ids themselves rather than on the array.
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(',');

  useEffect(() => {
    if (!key) return;
    let live = true;
    void fetchChatAuthors(key.split(',')).then((map) => {
      if (live) setById(map);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return byId;
}
