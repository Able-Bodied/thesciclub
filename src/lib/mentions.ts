import { useEffect, useState } from 'react';
import { readInBatches, readPages } from '@/lib/read-pages';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';
import { isValidUsername } from '@/lib/usernames';

/**
 * @mentions in a room's posts (the owner, 2026-10-28; 20261029070000).
 *
 * The database finds the names in a post and tells those members; this finds
 * them the same way (private.mentioned_usernames), for the box's suggestions
 * and for the links in a post. A conversation suggests its own members
 * (the owner, 2026-10-29), though a mention there tells nobody more than the
 * message already does.
 */

/** An @name being typed at the caret: where its "@" is, and what follows, lowercased. */
export interface MentionQuery {
  start: number;
  text: string;
}

const AT_CARET = /(?:^|[^A-Za-z0-9_.@])@([A-Za-z0-9._]{0,20})$/;

export function mentionAt(text: string, caret: number): MentionQuery | null {
  const match = AT_CARET.exec(text.slice(0, caret));
  if (!match) return null;
  const typed = match[1] ?? '';
  return { start: caret - typed.length - 1, text: typed.toLowerCase() };
}

/** The words with `@username ` in place of what was typed, and where the caret goes. */
export function insertMention(
  text: string,
  caret: number,
  query: MentionQuery,
  username: string,
): { value: string; caret: number } {
  const after = text.slice(caret);
  const inserted = `@${username}${after.startsWith(' ') ? '' : ' '}`;
  const value = text.slice(0, query.start) + inserted + after;
  return { value, caret: query.start + inserted.length + (after.startsWith(' ') ? 1 : 0) };
}

export type MentionPiece =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; username: string };

/** As the database reads them: not inside a word or an address, a trailing "." or "_" left off. */
const MENTION = /(?<![A-Za-z0-9_.@])@([A-Za-z0-9._]+)/g;

export function splitMentions(text: string): MentionPiece[] {
  const pieces: MentionPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(MENTION)) {
    const raw = match[1] ?? '';
    const username = raw.toLowerCase().replace(/[._]+$/, '');
    if (!isValidUsername(username)) continue;
    if (match.index > at) pieces.push({ kind: 'text', text: text.slice(at, match.index) });
    pieces.push({ kind: 'mention', text: `@${raw.slice(0, username.length)}`, username });
    at = match.index + 1 + username.length;
  }
  if (at < text.length) pieces.push({ kind: 'text', text: text.slice(at) });
  return pieces;
}

export function mentionedUsernames(text: string): string[] {
  return [
    ...new Set(
      splitMentions(text).flatMap((piece) => (piece.kind === 'mention' ? [piece.username] : [])),
    ),
  ];
}

/* ------------------------------------------------------------ suggesting */

export interface MentionCandidate {
  id: string;
  displayName: string;
  username: string;
  photoPath: string | null;
  photoAlt: string | null;
}

interface CandidateRow {
  id: string;
  display_name: string;
  username: string | null;
  photo_path: string | null;
  photo_alt: string | null;
}

let candidates: Promise<MentionCandidate[]> | null = null;

/**
 * The members Peers shows (browse_members), with an @name, but not the viewer:
 * read once, when an "@" is first typed. Empty if it fails, and asked again.
 */
export function loadMentionCandidates(): Promise<MentionCandidate[]> {
  candidates ??= (async () => {
    const supabase = getSupabase();
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id ?? '';
    const { data, error } = await readPages<CandidateRow>((from, to) =>
      supabase
        .from('browse_members')
        .select('id, display_name, username, photo_path, photo_alt')
        .not('username', 'is', null)
        .order('display_name')
        .order('id')
        .range(from, to),
    );
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((row): row is CandidateRow & { username: string } => !!row.username && row.id !== me)
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        username: row.username,
        photoPath: row.photo_path,
        photoAlt: row.photo_alt,
      }));
  })().catch(() => {
    candidates = null;
    return [];
  });
  return candidates;
}

/**
 * Where to look, as the box knows it (the owner, 2026-10-29): `among` keeps to
 * those members, as in a conversation; `first` puts those members ahead of
 * everybody else, as the people already in a topic are.
 */
export interface MentionScope {
  among?: readonly string[] | undefined;
  first?: readonly string[] | undefined;
}

/**
 * The best few for what was typed: @name first, then a word of the name.
 * Nothing until a first letter follows the "@" (the owner, 2026-10-29).
 */
export function suggestMentions(
  members: readonly MentionCandidate[],
  typed: string,
  max = 6,
  scope: MentionScope = {},
): MentionCandidate[] {
  const needle = typed.toLowerCase();
  if (needle === '') return [];
  const among = scope.among ? new Set(scope.among) : null;
  const first = new Set(scope.first ?? []);
  const rank = (member: MentionCandidate): number => {
    if (member.username.startsWith(needle)) return 0;
    if (
      member.displayName
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.startsWith(needle))
    ) {
      return 1;
    }
    return member.username.includes(needle) ? 2 : -1;
  };
  return members
    .filter((member) => !among || among.has(member.id))
    .map((member) => ({ member, at: rank(member), near: first.has(member.id) ? 0 : 1 }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.near - b.near || a.at - b.at)
    .slice(0, max)
    .map(({ member }) => member);
}

/* -------------------------------------------------------------- linking */

/** Who an @name is, as chat_authors says: a link only where they have a profile. */
export interface MentionedMember {
  id: string;
  hasProfile: boolean;
}

const known = new Map<string, MentionedMember | null>();
let waiting = new Set<string>();
let flushing: Promise<void> | null = null;

export function resetMentions(): void {
  candidates = null;
  known.clear();
  waiting = new Set();
  flushing = null;
}
// At sign-out too, as the authors are.
onForgetSharedReads(resetMentions);

/** The names a screen's posts ask for in one read, a moment after they ask. */
function flush(): Promise<void> {
  flushing ??= new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  }).then(async () => {
    const names = [...waiting];
    waiting = new Set();
    flushing = null;
    // A failure leaves the names as words, and asks again next time.
    const { data, error } = await readInBatches<{
      id: string;
      username: string | null;
      has_profile: boolean;
    }>(names, (batch) =>
      getSupabase().from('chat_authors').select('id, username, has_profile').in('username', batch),
    ).catch(() => ({ data: null, error: { message: 'unread' } }));
    if (error) return;
    for (const name of names) known.set(name, null);
    for (const row of data ?? []) {
      if (row.username) {
        known.set(row.username.toLowerCase(), { id: row.id, hasProfile: row.has_profile });
      }
    }
  });
  return flushing;
}

export async function resolveMentions(names: readonly string[]): Promise<void> {
  const wanted = names.filter((name) => !known.has(name));
  if (wanted.length === 0) return;
  for (const name of wanted) waiting.add(name);
  await flush();
}

/** The members behind the @names in some words, filling in as they arrive. */
export function useMentionedMembers(text: string): ReadonlyMap<string, MentionedMember> {
  const key = mentionedUsernames(text).sort().join(',');
  const [, setRead] = useState(0);

  useEffect(() => {
    if (!key) return;
    let live = true;
    void resolveMentions(key.split(',')).then(() => {
      if (live) setRead((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [key]);

  const found = new Map<string, MentionedMember>();
  for (const name of key ? key.split(',') : []) {
    const member = known.get(name);
    if (member) found.set(name, member);
  }
  return found;
}
