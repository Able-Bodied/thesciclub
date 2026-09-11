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

interface BrowseMemberRow {
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
  created_at: string;
}

function toMember(row: BrowseMemberRow): BrowseMember {
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
    createdAt: row.created_at,
  };
}

export interface MembersState {
  members: BrowseMember[];
  loading: boolean;
  /** The database's own sentence where there is one — not a rewritten summary. */
  error: string | null;
}

export function useBrowseMembers(): MembersState {
  const [state, setState] = useState<MembersState>({
    members: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await getSupabase()
          .from('browse_members')
          .select('*')
          .order('display_name');
        if (cancelled) return;
        if (error) {
          setState({ members: [], loading: false, error: error.message });
          return;
        }
        setState({
          members: (data as BrowseMemberRow[]).map(toMember),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          members: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load members.',
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
