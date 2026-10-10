import { MENTOR_ALLOWANCE } from '@/routes/invites/mentor-invites';
import { BEFORE_AFTER, EDUCATION, EMPLOYMENT, INDEPENDENCE, MARITAL_STATUS } from '@/types/domain';

/**
 * The profile survey — the questions the deck actually searches on.
 *
 * Adapted from the peer-mentor survey in docs/index.html, minus the three
 * things onboarding already asked (level, completeness, when). Asking somebody
 * their injury level twice is how a form teaches people it is not paying
 * attention.
 *
 * Questions are grouped onto screens so related ones sit together, and each
 * screen carries a line about why it is being asked. Several of these are
 * genuinely personal — a catheter, a marriage, whether you have help at home —
 * and a form that explains itself is answered more honestly than one that does
 * not.
 */

export type Answer = string | string[] | boolean | null;

export interface Question {
  key: string;
  /** The member column this writes to. */
  column: string;
  title: string;
  kind: 'one' | 'many' | 'text' | 'yesno';
  options?: readonly string[];
  placeholder?: string;
  /** Cap on a multi-select, so the choices mean something. */
  max?: number;
  /** What the "add your own" box suggests, when "In your own words" is wrong. */
  otherPlaceholder?: string;
  /**
   * Whether a multi-select offers "Add your own" and a box to type it in.
   *
   * On for the three lists that are a sample of an open set rather than the
   * whole of one. Every option here came off a real directory, which means it
   * is what twenty-five people happened to write down — the club's own seed
   * data already contains a suprapubic catheter, a neural implant and "being a
   * mom in a wheelchair", none of which any fixed list would have guessed.
   *
   * Off for closed sets. Adding a language nobody can search on helps nobody.
   */
  allowOther?: boolean;
  /** Only asked when this returns true. */
  onlyIf?: (answers: Answers) => boolean;
}

export type Answers = Record<string, Answer>;

export const LANGUAGES = [
  'English',
  'Spanish',
  'Tagalog',
  'Vietnamese',
  'Mandarin',
  'Cantonese',
  'ASL',
] as const;

/**
 * Topics, drawn from what the seeded members actually offered to be asked
 * about rather than invented. These are the single most searched field.
 */
export const TOPICS = [
  'Adaptive sports',
  'Adaptive equipment',
  'Advocacy',
  'Aging with SCI',
  'Back to school',
  'Back to work',
  'Bladder & bowel',
  'Caregivers',
  'Driving & hand controls',
  'Getting into dating',
  'Home adaptations',
  'Independent living',
  'Intimacy',
  'Mental health',
  'Newly injured',
  'Pain management',
  'Parenting with SCI',
  'Pressure sores',
  'Pregnancy',
  'Spasticity',
  'Travel',
  'UTIs',
  'Vehicle modifications',
] as const;

export const INTERESTS = [
  'Arts & crafts',
  'Camping & outdoors',
  'Climbing',
  'Cooking',
  'Cycling',
  'Fishing',
  'Fitness & exercise',
  'Gardening',
  'Music',
  'Performing arts',
  'Photography',
  'Reading',
  'Ski & snowboard',
  'Team sports',
  'Travel',
  'Video games',
  'Volunteering',
  'Water sports',
] as const;

export const SELF_CARE = [
  'Intermittent catheter',
  'Suprapubic catheter',
  'Foley catheter',
  'Mitrofanoff',
  'Colostomy',
  'Ileostomy',
  'Baclofen pump',
  'Botox',
  'Tendon transfer',
  'FES bike',
  'Standing frame',
  'Shoulder preservation',
  'Hiring & managing caregivers',
  'Service animals',
  'Dictation software',
  'Vehicle modifications',
  'Wheelchair assist devices',
  // No 'Something else'. The list carried one until the owner pointed out that
  // "Add your own" already does that job, and better: it takes the words rather
  // than recording only that there were some. "Something else" was the
  // languages list's 'Other' in a different coat — an answer nobody can be
  // searched by, on the field members search hardest.
  //
  // Nothing needs migrating. Nobody had it saved, live or locally, and a saved
  // answer missing from the options renders as one of the member's own anyway —
  // which is what happened to the people who had picked 'Other' for a language.
] as const;

/** The self-care answers that "The specifics" asks about. */
export const SPECIFICS_FOR: readonly string[] = [
  'Dictation software',
  'Vehicle modifications',
  'Wheelchair assist devices',
];

export const QUESTIONS: Question[] = [
  {
    key: 'gender',
    column: 'gender',
    title: 'How do you describe yourself?',
    kind: 'one',
    options: ['Male', 'Female', 'Prefer to self-describe', 'Prefer not to say'],
  },
  {
    key: 'languages',
    column: 'languages',
    title: 'What languages do you speak?',
    kind: 'many',
    options: LANGUAGES,
    // Seven languages in a state that speaks more than two hundred, so the
    // list was always a sample. "Other" used to sit at the end of it and is
    // gone: it recorded only "not one of these", which no member can be found
    // by, and the box that replaced it records the language itself.
    //
    // Anybody who already picked "Other" keeps it — a saved answer that is no
    // longer on the list still renders, as one of their own.
    allowOther: true,
    otherPlaceholder: 'Punjabi, Hmong, Farsi…',
  },

  {
    key: 'bio',
    column: 'bio',
    title: 'Brief bio',
    kind: 'text',
    placeholder:
      'Avid handcyclist and gardener who loves the outdoors. Manual chair user with full hand strength, but bilateral carpal tunnel.',
  },

  {
    key: 'howInjured',
    column: 'how_injured',
    title: 'How were you paralyzed?',
    kind: 'text',
    placeholder: 'Car accident on the 880, 2013…',
  },

  {
    key: 'topics',
    column: 'topics',
    title: 'Topics you are happy to talk about',
    kind: 'many',
    options: TOPICS,
    allowOther: true,
    otherPlaceholder: 'In your own words',
  },

  {
    key: 'maritalStatus',
    column: 'marital_status',
    title: 'Marital status',
    kind: 'one',
    options: MARITAL_STATUS,
  },
  { key: 'hasChildren', column: 'has_children', title: 'Do you have children?', kind: 'yesno' },
  {
    key: 'childrenWhen',
    column: 'children_when',
    title: 'Before or after your injury?',
    kind: 'one',
    options: BEFORE_AFTER,
    onlyIf: (a) => a.hasChildren === true,
  },

  {
    key: 'independence',
    column: 'independence',
    title: 'Level of independence',
    kind: 'one',
    options: INDEPENDENCE,
  },
  {
    key: 'employment',
    column: 'employment',
    title: 'Employment status',
    kind: 'one',
    options: EMPLOYMENT,
  },

  {
    key: 'education',
    column: 'education',
    title: 'Highest education completed',
    kind: 'one',
    options: EDUCATION,
  },
  {
    key: 'educationWhen',
    column: 'education_when',
    title: 'Before or after your injury?',
    kind: 'one',
    options: BEFORE_AFTER,
  },

  {
    key: 'fieldOfWork',
    column: 'field_of_work',
    title: 'Field of work',
    kind: 'text',
    placeholder: 'Software engineering',
  },

  {
    key: 'interests',
    column: 'interests',
    title: 'Pick your top three interests',
    kind: 'many',
    options: INTERESTS,
    max: 3,
    allowOther: true,
    otherPlaceholder: 'In your own words',
  },

  {
    key: 'sportsEquipment',
    column: 'sports_equipment',
    title: 'Do you own any adaptive sports equipment?',
    kind: 'text',
    placeholder: 'Top End Force 3 handcycle, Freewheel, and HOC Glide ski',
  },

  // In words rather than a list of organizations (owner, 2026-10-08): which
  // grant paid for what is the part another member asks about.
  {
    key: 'grants',
    column: 'grants',
    title: 'Did you receive any grants?',
    kind: 'text',
    placeholder:
      'I received a Kelly Brush grant and High Fives grant for my handcycle and a NorCal SCI Franklin Project rehab grant to go to Neuroworx.',
  },

  {
    key: 'selfCare',
    column: 'self_care',
    title: 'Self-care devices and procedures',
    kind: 'many',
    options: SELF_CARE,
    allowOther: true,
    otherPlaceholder: 'In your own words',
  },

  // Asked only of somebody who chose one of the self-care answers it is about
  // (owner, 2026-10-10): which program, which modifications, which device.
  // Still asked of anybody who already wrote something here, so an answer is
  // never left where its author cannot reach it.
  {
    key: 'detail',
    column: 'detail',
    title: 'Anything worth spelling out?',
    kind: 'text',
    placeholder: 'SmartDrive; Dragon; 2019 Odyssey with a power sliding door…',
    onlyIf: (a) =>
      (Array.isArray(a.selfCare) && a.selfCare.some((c) => SPECIFICS_FOR.includes(c))) ||
      (typeof a.detail === 'string' && a.detail.trim() !== ''),
  },

  {
    key: 'wantsToMentor',
    column: 'wants_to_mentor',
    title: 'Do you want to be a peer mentor?',
    kind: 'yesno',
  },
];

export interface Screen {
  title: string;
  keys: string[];
  hint?: string;
  /** A short list under the hint, before the questions: what saying yes means. */
  details?: { title: string; items: string[] };
}

export const SCREENS: Screen[] = [
  { title: 'About you', keys: ['gender', 'languages'] },
  {
    title: 'Brief bio',
    keys: ['bio'],
    hint: 'The lines that sit on your profile. What you use, how you get about, who is around you.',
  },
  {
    title: 'How were you paralyzed?',
    keys: ['howInjured'],
    hint: 'In your own words. Members read this to find somebody whose story rhymes with theirs.',
  },
  { title: 'Family', keys: ['maritalStatus', 'hasChildren', 'childrenWhen'] },
  { title: 'Day to day', keys: ['independence', 'employment'] },
  { title: 'Education', keys: ['education', 'educationWhen'] },
  {
    title: 'Work',
    keys: ['fieldOfWork'],
    hint: 'What you do now, or did before. Either is useful to somebody.',
  },
  {
    title: 'Interests',
    keys: ['interests'],
    hint: 'Three, so the ones you pick actually mean something.',
  },
  {
    title: 'Self-care devices',
    keys: ['selfCare'],
    hint: 'Only what you are comfortable discussing. The single most searched field in the club.',
  },
  // Only after one of the three self-care answers it asks about (`detail`'s
  // onlyIf); otherwise the survey steps over it (`stepFrom`).
  {
    title: 'The specifics',
    keys: ['detail'],
    hint: 'Which dictation program, which vehicle modifications, which assist devices — the details are what people message you about.',
  },
  {
    title: 'Do you own any adaptive sports equipment?',
    keys: ['sportsEquipment'],
    hint: 'Make and model if you know them. Somebody trying one for the first time may want to ask you about it.',
  },
  {
    title: 'Did you receive any grants?',
    keys: ['grants'],
    hint: 'Who it was from and what it paid for — equipment, a vehicle, rehab, a home change. Members applying for their first want to know who has been through it.',
  },
  // Why first, then what it means (owner, 2026-10-10). The allowance is read
  // from the invites screen's constant, which mirrors mentor_invite_limit():
  // this hint said "two numbers" for a month after the limit became ten. And
  // yes is a request — an administrator makes somebody a mentor
  // (guard_own_member_row) — so the list says so rather than promising it.
  {
    title: 'Mentoring',
    keys: ['wantsToMentor'],
    hint: 'Mentoring peers is not only helpful to the community, but also very rewarding. Help someone newly injured navigate SCI and all the complications involved. Become a mentor.',
    details: {
      title: 'As a mentor',
      items: [
        'You appear first to newly injured members looking for someone who has been there.',
        `You can invite up to ${MENTOR_ALLOWANCE} people to the club.`,
        'Saying yes tells the club you are interested. An administrator makes it official.',
      ],
    },
  },
  {
    title: 'Topics you are happy to talk about',
    keys: ['topics'],
    hint: 'This is what other members search on. Pick anything you would not mind a stranger asking about.',
  },
];

const BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));

export function questionFor(key: string): Question | undefined {
  return BY_KEY.get(key);
}

/** The questions on a screen that apply, given what has been answered so far. */
export function questionsOn(screen: Screen, answers: Answers): Question[] {
  return screen.keys
    .map((k) => BY_KEY.get(k))
    .filter((q): q is Question => q !== undefined)
    .filter((q) => !q.onlyIf || q.onlyIf(answers));
}

/**
 * The indexes of the screens that have something to ask, in order.
 *
 * A screen whose every question is conditional and off — "The specifics" for
 * somebody who chose none of its three self-care answers — is not shown at
 * all, rather than as a title over nothing. The counter and the bar count
 * these, so "10 of 13" is what this member will actually see.
 */
export function screensThatApply(answers: Answers): number[] {
  return SCREENS.flatMap((screen, index) =>
    questionsOn(screen, answers).length > 0 ? [index] : [],
  );
}

/**
 * The next screen with something to ask, from `index` (inclusive) in the
 * direction of `step`. Past the last screen is `SCREENS.length`, which the
 * survey treats as finishing; before the first is the first.
 */
export function stepFrom(index: number, step: 1 | -1, answers: Answers): number {
  let at = index;
  while (at >= 0 && at < SCREENS.length) {
    const screen = SCREENS[at];
    if (screen && questionsOn(screen, answers).length > 0) return at;
    at += step;
  }
  return at < 0 ? 0 : SCREENS.length;
}

/**
 * Things nobody may decline.
 *
 * A row cannot exist without a name, and the 18+ trigger cannot do its job
 * without a birthday. Mirrored by the `members_declined_excludes_required`
 * check in 20260917030000 — the database refuses these whatever the client
 * does, and this list is here so the client does not offer a button the
 * database will answer with a constraint violation.
 *
 * Both spellings of each, because the survey and the details form name them
 * differently and this guard should not depend on which one asked.
 */
export const UNDECLINABLE = ['displayName', 'name', 'birthDate', 'birthday'] as const;

export function canDecline(key: string): boolean {
  return !(UNDECLINABLE as readonly string[]).includes(key);
}

/**
 * Whether a question has been dealt with — answered, or declined.
 *
 * Declining is an answer, and that is the whole of what 20260917030000 adds.
 * "Skip this one" leaves a null, which is honestly indistinguishable from
 * "have not got to it yet" and is counted as undone; "Prefer not to say" is a
 * decision, and a profile made of decisions is finished. Without the second,
 * somebody who is never going to put a photograph up is shown an unfinished
 * profile for ever with no way to say otherwise.
 */
export function isAnswered(
  question: Question,
  answers: Answers,
  declined: ReadonlySet<string> = EMPTY_DECLINED,
): boolean {
  if (declined.has(question.key)) return true;
  const value = answers[question.key];
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return true;
  return value.trim() !== '';
}

/** Shared so the default argument does not allocate a Set per call. */
const EMPTY_DECLINED: ReadonlySet<string> = new Set();

/**
 * A screen of nothing but single-choice questions advances itself once they are
 * all answered — there is nothing left to do on it, and making somebody confirm
 * that is a tap for no reason. A screen with any text or multi-select does not,
 * because the person is not finished until they say so.
 */
export function advancesItself(screen: Screen, answers: Answers): boolean {
  const questions = questionsOn(screen, answers);
  if (questions.length === 0) return false;
  return questions.every((q) => q.kind === 'one' || q.kind === 'yesno');
}

/** Every question that applies right now, conditionals included. */
export function applicableQuestions(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => !q.onlyIf || q.onlyIf(answers));
}

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

export function progressOf(
  answers: Answers,
  declined: ReadonlySet<string> = EMPTY_DECLINED,
): Progress {
  const applicable = applicableQuestions(answers);
  const done = applicable.filter((q) => isAnswered(q, answers, declined)).length;
  return {
    done,
    total: applicable.length,
    percent: applicable.length === 0 ? 0 : Math.round((done / applicable.length) * 100),
  };
}

/** Toggle a value in a multi-select, respecting its cap. */
export function toggleMany(current: string[], value: string, max?: number): string[] {
  if (current.includes(value)) return current.filter((v) => v !== value);
  if (max !== undefined && current.length >= max) return current;
  return [...current, value];
}

/**
 * One answer as the overview prints it (src/routes/profile/answers.tsx): the
 * member's words, the chosen options in a list, Yes or No, or what was decided
 * instead of an answer. Never blank, so a row cannot look like a bug.
 */
export function answerInWords(
  question: Question,
  answers: Answers,
  declined: ReadonlySet<string> = EMPTY_DECLINED,
): string {
  if (declined.has(question.key)) return 'Rather not say';
  if (!isAnswered(question, answers)) return 'Not answered yet';
  const value = answers[question.key];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The first screen with a question that applies and is neither answered nor
 * declined, or null when every one is dealt with — where "Carry on" goes.
 */
export function firstOpenScreen(
  answers: Answers,
  declined: ReadonlySet<string> = EMPTY_DECLINED,
): number | null {
  const index = SCREENS.findIndex((screen) =>
    questionsOn(screen, answers).some((q) => !isAnswered(q, answers, declined)),
  );
  return index === -1 ? null : index;
}
