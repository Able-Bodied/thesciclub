import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { BrowseMember } from '@/types/domain';

/**
 * Reading members.
 *
 * Everything goes through `browse_members`, which is the only projection
 * through which one member sees another — it does not select `phone` or
 * `birth_date` at all, and it is granted to `authenticated` only. Nothing here
 * queries `members` directly; own-row-only RLS would return a single row.
 *
 * The row shape is snake_case from Postgres and camelCase in the app, so the
 * mapping happens once, here, rather than in every component.
 */

export interface BrowseMemberRow {
  id: string;
  type: string;
  display_name: string;
  photo_path: string | null;
  photo_alt: string | null;
  avatar_color: string | null;
  city: string | null;
  state: string;
  level_range: string;
  exact_level: string | null;
  completeness: string;
  injury_date: string | null;
  injury_date_precision: string | null;
  region: string;
  age: number | null;
  how_injured: string | null;
  bio: string | null;
  detail: string | null;
  gender: string | null;
  languages: string[] | null;
  independence: string | null;
  employment: string | null;
  field_of_work: string | null;
  education: string | null;
  education_when: string | null;
  marital_status: string | null;
  has_children: boolean | null;
  children_when: string | null;
  interests: string[] | null;
  topics: string[] | null;
  self_care: string[] | null;
  affiliations: string[] | null;
  wants_to_mentor: boolean;
  is_seed: boolean;
  is_admin: boolean;
  created_at: string;
}

/** The one row -> domain mapping. Exported so nothing writes a second one. */
export function toMember(row: BrowseMemberRow): BrowseMember {
  return {
    id: row.id,
    type: row.type === 'mentor' ? 'mentor' : 'peer',
    displayName: row.display_name,
    photoPath: row.photo_path,
    photoAlt: row.photo_alt,
    avatarColor: row.avatar_color,
    city: row.city,
    state: row.state,
    levelRange: row.level_range as BrowseMember['levelRange'],
    exactLevel: row.exact_level as BrowseMember['exactLevel'],
    completeness: row.completeness as BrowseMember['completeness'],
    injuryDate: row.injury_date,
    injuryDatePrecision: row.injury_date_precision as BrowseMember['injuryDatePrecision'],
    region: row.region as BrowseMember['region'],
    age: row.age,
    howInjured: row.how_injured,
    bio: row.bio,
    detail: row.detail,
    gender: row.gender,
    languages: row.languages ?? [],
    independence: row.independence as BrowseMember['independence'],
    employment: row.employment as BrowseMember['employment'],
    fieldOfWork: row.field_of_work,
    education: row.education,
    educationWhen: row.education_when as BrowseMember['educationWhen'],
    maritalStatus: row.marital_status as BrowseMember['maritalStatus'],
    hasChildren: row.has_children,
    childrenWhen: row.children_when as BrowseMember['childrenWhen'],
    interests: row.interests ?? [],
    topics: row.topics ?? [],
    selfCare: row.self_care ?? [],
    affiliations: row.affiliations ?? [],
    wantsToMentor: row.wants_to_mentor,
    isSeed: row.is_seed,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  };
}

export interface MembersState {
  members: BrowseMember[];
  loading: boolean;
  /** The database's own sentence where there is one — not a rewritten summary. */
  error: string | null;
  /**
   * No session, as opposed to a failed query. Kept separate because they are
   * different screens: "permission denied for view browse_members" is an
   * accurate thing to show a developer and a useless thing to show a member.
   */
  signedOut: boolean;
}

export function useBrowseMembers(): MembersState {
  const [state, setState] = useState<MembersState>({
    members: [],
    loading: true,
    error: null,
    signedOut: false,
  });

  useEffect(() => {
    // An AbortController rather than a `let cancelled` flag: the flag reads as
    // always-false to the type checker after its first check, since it cannot
    // see the cleanup closure mutate it across an await. This also genuinely
    // cancels the request instead of discarding its result.
    const controller = new AbortController();
    const { signal } = controller;
    // Read through a call, not a property: the type checker narrows
    // `signal.aborted` to false after the first check and then flags every
    // later one as dead code. A call result cannot be narrowed.
    const aborted = () => signal.aborted;

    async function load() {
      try {
        const supabase = getSupabase();

        // Ask before knocking. Without this, a signed-out visitor gets the
        // database's refusal rendered at them verbatim.
        const { data: sessionData } = await supabase.auth.getSession();
        if (aborted()) return;
        if (!sessionData.session) {
          setState({ members: [], loading: false, error: null, signedOut: true });
          return;
        }

        const { data, error } = await supabase
          .from('browse_members')
          .select('*')
          .order('display_name')
          .abortSignal(signal);
        if (aborted()) return;
        if (error) {
          setState({ members: [], loading: false, error: error.message, signedOut: false });
          return;
        }
        setState({
          members: (data as BrowseMemberRow[]).map(toMember),
          loading: false,
          error: null,
          signedOut: false,
        });
      } catch (e) {
        if (aborted()) return;
        setState({
          members: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load members.',
          signedOut: false,
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}

/**
 * One member, by id.
 *
 * Fetches rather than reading from a loaded deck, so a profile opens correctly
 * on a direct link or a refresh — the deck is not guaranteed to be in memory.
 * `notFound` is distinct from an error: somebody whose membership ended, or a
 * stale link, is not a failure to report.
 */
export interface MemberState {
  member: BrowseMember | null;
  loading: boolean;
  error: string | null;
  signedOut: boolean;
  notFound: boolean;
}

export function useBrowseMember(id: string | undefined): MemberState {
  const [state, setState] = useState<MemberState>({
    member: null,
    loading: true,
    error: null,
    signedOut: false,
    notFound: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const aborted = () => signal.aborted;

    async function load() {
      if (!id) {
        setState({ member: null, loading: false, error: null, signedOut: false, notFound: true });
        return;
      }
      try {
        const supabase = getSupabase();
        const { data: sessionData } = await supabase.auth.getSession();
        if (aborted()) return;
        if (!sessionData.session) {
          setState({
            member: null,
            loading: false,
            error: null,
            signedOut: true,
            notFound: false,
          });
          return;
        }

        // Taken whole rather than destructured: maybeSingle() types `data` as
        // `any`, and destructuring it would launder an untyped value into state
        // with nothing to flag it.
        const result = await supabase
          .from('browse_members')
          .select('*')
          .eq('id', id)
          .abortSignal(signal)
          .maybeSingle();
        if (aborted()) return;
        if (result.error) {
          setState({
            member: null,
            loading: false,
            error: result.error.message,
            signedOut: false,
            notFound: false,
          });
          return;
        }
        const row = result.data as BrowseMemberRow | null;
        setState({
          member: row ? toMember(row) : null,
          loading: false,
          error: null,
          signedOut: false,
          notFound: row === null,
        });
      } catch (e) {
        if (aborted()) return;
        setState({
          member: null,
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load this member.',
          signedOut: false,
          notFound: false,
        });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [id]);

  return state;
}
