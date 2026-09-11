/**
 * Domain types for The SCI Club.
 *
 * Single source of truth for every shape in the app. Additive changes are fine; renaming a field
 * is a conversation first. Where this disagrees with docs/CONTEXT.md, CONTEXT.md wins and this
 * file is what should change.
 *
 * Vocabulary, per docs/CONTEXT.md: everyone is a **Member**. **Mentor** is an attribute of a
 * member, not a separate kind of person. There is no "user" and no "peer" as an identity.
 */

/* ------------------------------------------------------------------ injury */

/**
 * The coarse level range asked during onboarding. Six options, answerable in one tap by somebody
 * who may be filling this in from a hospital bed — the exact level is asked later, in the profile
 * survey, by anyone who wants to give it.
 */
export const LEVEL_RANGES = ['C1–C4', 'C5–C8', 'T1–T6', 'T7–T12', 'L1–S5', 'Not sure yet'] as const;
export type LevelRange = (typeof LEVEL_RANGES)[number];

/** The exact level, refined in the profile survey. Optional — the range is what onboarding sets. */
export const EXACT_LEVELS = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T10',
  'T11',
  'T12',
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  // Injuries between two segments. People describe themselves this way, and the
  // NorCal SCI directory records four of them.
  'C4/5',
  'C5/6',
  'C6/7',
  'T11/12',
  'Do not know',
] as const;
export type ExactLevel = (typeof EXACT_LEVELS)[number];

/**
 * Region, derived from the range rather than stored by hand. This is what the Peers filter groups
 * on, and it is a generated column in the database for the same reason it is a function here:
 * a filter and a profile must never disagree about which region someone is in.
 */
export const INJURY_REGIONS = ['Cervical', 'Thoracic', 'Lumbar & sacral', 'Unknown'] as const;
export type InjuryRegion = (typeof INJURY_REGIONS)[number];

export function regionForRange(range: LevelRange): InjuryRegion {
  switch (range) {
    case 'C1–C4':
    case 'C5–C8':
      return 'Cervical';
    case 'T1–T6':
    case 'T7–T12':
      return 'Thoracic';
    case 'L1–S5':
      return 'Lumbar & sacral';
    case 'Not sure yet':
      return 'Unknown';
  }
}

/**
 * The coarse range an exact level falls into, by its first segment.
 *
 * Derived rather than asked twice: onboarding collects the exact level, and the
 * range exists so a filter has something broad to group on. Taking the first
 * segment of a between-segments level ("C4/5" -> C4) is the conservative read —
 * it does not overstate function.
 */
export function rangeForExact(level: ExactLevel): LevelRange {
  if (level === 'Do not know') return 'Not sure yet';
  const match = /^([CTLS])(\d+)/.exec(level);
  if (!match) return 'Not sure yet';
  const segment = match[1];
  const n = Number(match[2]);
  if (segment === 'C') return n <= 4 ? 'C1–C4' : 'C5–C8';
  if (segment === 'T') return n <= 6 ? 'T1–T6' : 'T7–T12';
  return 'L1–S5';
}

export const COMPLETENESS = ['Complete', 'Incomplete', 'Do not know'] as const;
export type Completeness = (typeof COMPLETENESS)[number];

/**
 * How precisely somebody gave their date of injury. Stored so nothing ever displays more precision
 * than was actually offered — "injured 2013", never a fabricated "1 March 2013". Year-only is a
 * normal answer, not a skip (docs/CONTEXT.md).
 */
export const DATE_PRECISIONS = ['day', 'month', 'year'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/* ------------------------------------------------------------- life and kit */

export const INDEPENDENCE = [
  'Completely independent',
  /** Not one of the survey's options — it comes from the NorCal SCI directory,
   *  where people described themselves this way. Kept rather than flattened. */
  'Mostly independent',
  'Partially independent',
  'Partially dependent',
  'Completely dependent',
] as const;
export type Independence = (typeof INDEPENDENCE)[number];

export const EMPLOYMENT = [
  'Full time',
  'Part time',
  'Student',
  'Retired',
  'Seeking work',
  'Not currently working',
] as const;
export type Employment = (typeof EMPLOYMENT)[number];

export const EDUCATION = [
  'High school / GED',
  'Some college',
  "Associate's degree",
  "Bachelor's degree",
  "Master's degree",
  'PhD, MD, JD or similar',
  'In progress',
] as const;
export type Education = (typeof EDUCATION)[number];

/** Asked about education and children alike: before the injury, after it, or both. */
export const BEFORE_AFTER = ['Before', 'After', 'Both'] as const;
export type BeforeAfter = (typeof BEFORE_AFTER)[number];

export const MARITAL_STATUS = [
  'Single',
  'Married or partnered',
  'Divorced or separated',
  'Widowed',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUS)[number];

/* ------------------------------------------------------------------ member */

/* ---------------------------------------------------------------- location */

/**
 * States, as the two-letter codes the `state` column holds. All fifty plus DC:
 * the club is Northern California today, but somebody moves, and a list that
 * cannot express where they live is a worse problem than a long dropdown.
 */
export const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
] as const;

export type UsStateCode = (typeof US_STATES)[number][0];

export function stateNameFor(code: string): string | null {
  return US_STATES.find(([c]) => c === code)?.[1] ?? null;
}

export function stateCodeForName(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return US_STATES.find(([, n]) => n.toLowerCase() === wanted)?.[0] ?? null;
}

/* ------------------------------------------------------------------ member */

export const MEMBER_TYPES = ['peer', 'mentor'] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

/**
 * Membership can be lost — see docs/CONTEXT.md. `suspended` and `removed` both drop somebody out
 * of `browse_members`; the difference is whether it is reversible.
 */
export const MEMBER_STATUSES = ['active', 'suspended', 'removed'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * A member as anybody other than themselves can see them: the `browse_members` projection.
 *
 * `phone` and `birthDate` are absent by construction, not by omission. The database view makes the
 * same cut in SQL, so neither this type nor that view is load-bearing on its own.
 */
export interface BrowseMember {
  id: string;
  type: MemberType;
  displayName: string;
  /** Path inside the public `photos` bucket, not a URL. Compose one with
   *  `photoUrlFor()` so the project ref is never baked into the data. */
  photoPath: string | null;
  photoAlt: string | null;
  avatarColor: string | null;

  city: string | null;
  state: string;

  levelRange: LevelRange;
  exactLevel: ExactLevel | null;
  completeness: Completeness;
  injuryDate: string | null;
  injuryDatePrecision: DatePrecision | null;
  region: InjuryRegion;
  /** Derived on read, never stored — a stored age is wrong within a year. */
  age: number | null;

  howInjured: string | null;
  bio: string | null;
  detail: string | null;

  gender: string | null;
  languages: string[];
  independence: Independence | null;
  employment: Employment | null;
  fieldOfWork: string | null;
  /** Free text, not `Education`. That enum is the survey picker's options; the
   *  column holds whatever somebody wrote ("Master's in Nursing Leadership"). */
  education: string | null;
  educationWhen: BeforeAfter | null;
  maritalStatus: MaritalStatus | null;
  hasChildren: boolean | null;
  childrenWhen: BeforeAfter | null;

  /** Capped at three, so the ones chosen actually mean something. */
  interests: string[];
  /** "Ask me about" — the field members search on most. */
  topics: string[];
  /** Devices and procedures somebody is willing to discuss. */
  selfCare: string[];

  affiliations: string[];
  wantsToMentor: boolean;
  /** Seeded from the NorCal SCI directory rather than entered by the member. */
  isSeed: boolean;
  createdAt: string;
}

/** The viewer's own row, which does carry the two fields `BrowseMember` refuses to. */
export interface OwnMember extends BrowseMember {
  phone: string;
  birthDate: string;
  status: MemberStatus;
  showInBrowse: boolean;
  invitedBy: string | null;
}

/* ------------------------------------------------------------------ invite */

/**
 * One phone number placed on the list. `pending` until it is used; `consumed` once an account
 * exists behind it. Revoking a pending invite takes it off the list.
 */
export const INVITE_STATUSES = ['pending', 'consumed', 'revoked'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export interface Invite {
  id: string;
  /** E.164. Normalized on write so a lookup cannot miss on formatting. */
  phone: string;
  status: InviteStatus;
  invitedByMemberId: string | null;
  invitedByOrganizationId: string | null;
  createdAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

/* ------------------------------------------------------------ organization */

export interface Organization {
  id: string;
  /** Two or three letters, for the badge on a mentor's card. */
  shortCode: string;
  name: string;
  city: string;
  description: string;
  tags: string[];
  /** Whether this organization can put numbers on the list. */
  canInvite: boolean;
}

/* ------------------------------------------------------------------ browse */

export const PEERS_SEGMENTS = ['everyone', 'near', 'mentors'] as const;
export type PeersSegment = (typeof PEERS_SEGMENTS)[number];

export interface MemberFilters {
  regions: InjuryRegion[];
  cities: string[];
  topics: string[];
  search: string;
}

export const EMPTY_MEMBER_FILTERS: MemberFilters = {
  regions: [],
  cities: [],
  topics: [],
  search: '',
};
