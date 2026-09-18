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
  'Something else',
] as const;

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
    key: 'howInjured',
    column: 'how_injured',
    title: 'How were you injured?',
    kind: 'text',
    placeholder: 'Car accident on the 880, 2013…',
  },

  {
    key: 'bio',
    column: 'bio',
    title: 'In your own words',
    kind: 'text',
    placeholder: 'Manual chair with a SmartDrive. Live alone, drive with hand controls…',
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
    key: 'selfCare',
    column: 'self_care',
    title: 'Self-care devices and procedures',
    kind: 'many',
    options: SELF_CARE,
    allowOther: true,
    otherPlaceholder: 'In your own words',
  },

  {
    key: 'detail',
    column: 'detail',
    title: 'Anything worth spelling out?',
    kind: 'text',
    placeholder: 'SmartDrive; Dragon; 2019 Odyssey with a power sliding door…',
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
}

export const SCREENS: Screen[] = [
  { title: 'About you', keys: ['gender', 'languages'] },
  {
    title: 'How it happened',
    keys: ['howInjured'],
    hint: 'In your own words. Members read this to find somebody whose story rhymes with theirs.',
  },
  {
    title: 'In your own words',
    keys: ['bio'],
    hint: 'The lines that sit on your profile. What you use, how you get about, who is around you.',
  },
  {
    title: 'Topics you are happy to talk about',
    keys: ['topics'],
    hint: 'This is what other members search on. Pick anything you would not mind a stranger asking about.',
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
  {
    title: 'The specifics',
    keys: ['detail'],
    hint: 'Which dictation program, which vehicle modifications, which assist devices — the details are what people message you about.',
  },
  {
    title: 'Mentoring',
    keys: ['wantsToMentor'],
    hint: 'Mentors appear first to newly injured members, and can put two numbers on the club’s list.',
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
