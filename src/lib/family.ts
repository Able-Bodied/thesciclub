import { useCallback, useEffect, useState } from 'react';
import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Family links (the owner, 2026-11-07; 20261107100000). A member links another
 * from the ••• on their profile; it shows on both profiles once the other says
 * yes. Until then only the two of them see it, and a no is never announced.
 */

export const RELATIONS = ['spouse', 'parent', 'child', 'sibling', 'family'] as const;
export type Relation = (typeof RELATIONS)[number];

/** As a choice: "Ana is my…". */
export const RELATION_CHOICES: Record<Relation, string> = {
  spouse: 'Spouse or partner',
  parent: 'Parent',
  child: 'Child',
  sibling: 'Brother or sister',
  family: 'Other family',
};

/** On a profile, beside the name. */
export const RELATION_LABELS: Record<Relation, string> = {
  spouse: 'Spouse or partner',
  parent: 'Parent',
  child: 'Child',
  sibling: 'Brother or sister',
  family: 'Family',
};

/** In a sentence: ", as your parent", or nothing for plain family. */
export function familyAs(relation: string | null): string {
  switch (relation) {
    case 'spouse':
      return ', as your spouse or partner';
    case 'parent':
      return ', as your parent';
    case 'child':
      return ', as your child';
    case 'sibling':
      return ', as your brother or sister';
    default:
      return '';
  }
}

export function isRelation(value: string): value is Relation {
  return (RELATIONS as readonly string[]).includes(value);
}

export interface FamilyLink {
  linkId: string;
  memberId: string;
  displayName: string;
  photoPath: string | null;
  /** What this member is to the profile's member. */
  relation: Relation;
  /** asked_by_me: the reader asked (a no reads the same); asked_of_me: they are asked. */
  state: 'linked' | 'asked_by_me' | 'asked_of_me';
}

interface Row {
  link_id: string;
  member_id: string;
  display_name: string;
  photo_path: string | null;
  relation: string;
  state: string;
}

function toLink(row: Row): FamilyLink | null {
  if (!isRelation(row.relation)) return null;
  if (row.state !== 'linked' && row.state !== 'asked_by_me' && row.state !== 'asked_of_me')
    return null;
  return {
    linkId: row.link_id,
    memberId: row.member_id,
    displayName: row.display_name,
    photoPath: row.photo_path,
    relation: row.relation,
    state: row.state,
  };
}

/** A member's family as the reader may see it; empty while read or on a failure. */
export function useMemberFamily(memberId: string | undefined): {
  family: FamilyLink[];
  reload: () => void;
} {
  const [family, setFamily] = useState<FamilyLink[]>([]);
  const [round, setRound] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` is only a trigger to read again.
  useEffect(() => {
    if (!memberId) return;
    let live = true;
    void getSupabase()
      .rpc('member_family', { p_member: memberId })
      .then(({ data, error }) => {
        if (!live || error) return;
        setFamily(((data ?? []) as Row[]).map(toLink).filter((link) => link !== null));
      });
    return () => {
      live = false;
    };
  }, [memberId, round]);
  const reload = useCallback(() => {
    setRound((n) => n + 1);
  }, []);
  return { family: memberId ? family : [], reload };
}

type Result = { ok: true } | { ok: false; error: string };

async function call(name: string, args: Record<string, unknown>, attempt: string): Promise<Result> {
  try {
    const { error } = await getSupabase().rpc(name, args);
    return error ? { ok: false, error: describeError(error, attempt) } : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, attempt) };
  }
}

/** `relation` is what the other member is to the reader. */
export function askFamilyLink(memberId: string, relation: Relation): Promise<Result> {
  return call(
    'ask_family_link',
    { p_member: memberId, p_relation: relation },
    'Could not send that.',
  );
}

export function answerFamilyLink(linkId: string, yes: boolean): Promise<Result> {
  return call('answer_family_link', { p_link: linkId, p_yes: yes }, 'Could not answer that.');
}

/** An ask withdrawn or a link undone, by either of the two. */
export function removeFamilyLink(linkId: string): Promise<Result> {
  return call('remove_family_link', { p_link: linkId }, 'Could not remove that.');
}
