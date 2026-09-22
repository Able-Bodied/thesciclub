/**
 * Turning a refusal into a sentence a member can read.
 *
 * Too many refusals used to reach the screen as the database's own words —
 * `new row for relation "chat_messages" violates check constraint
 * "chat_messages_check"`, `Could not find the function public.chat_my_threads
 * without parameters in the schema cache` — and a member who reads one of
 * those reads the app as broken rather than as having said no.
 *
 * Every read and write helper calls this **before** the error becomes a
 * string, because this is the last place it still carries its `code` — the
 * SQLSTATE, or PostgREST's own `PGRST…` — and the code is the only honest way
 * to tell the cases apart. The same action fails two different ways: a
 * mentor's invite is refused by the allowance (a policy, 42501) and by the
 * unique index (23505), and a message that guessed would be wrong exactly
 * when the person was already confused.
 *
 * ---------------------------------------------------------------------------
 * Two kinds of message, and only one is translated
 * ---------------------------------------------------------------------------
 * **Ours.** Every `raise exception` in the migrations is already prose —
 * "Only an active member can start a room.", "You cannot report your own
 * message. Remove it instead." They pass through untouched. Most carry no
 * errcode and arrive as `P0001`, plpgsql's default; the rest are `P0002`,
 * `22023`, or `42501` *without* "row-level security" in the message. A
 * translator that flattened those into "Something went wrong" would be a
 * regression.
 *
 * **The database's and PostgREST's.** These are the ones caught, by code, with
 * the real strings recorded in describe-error.test.ts. `42501` is the one that
 * needs the phrase as well as the code: a policy refusing a row, a grant
 * missing on a column, and our own `raise … using errcode = '42501'` all share
 * it.
 *
 * Anything with a code this file does not know gets a generic sentence and a
 * `console.error` of the raw error, so the text is not lost, only not shown.
 * Anything with *no* code and no recognisable phrase is taken to be ours and
 * passed through: PostgREST always sends a code, so a bare message is a
 * sentence somebody wrote.
 */

/** The shape supabase-js hands back, and what a thrown `Error` has in common with it. */
export interface Failure {
  message: string;
  /** A SQLSTATE or `PGRST…` string; a `DOMException` carries a legacy number here, which says nothing. */
  code?: string | number | null | undefined;
  name?: string | undefined;
}

/**
 * What was being attempted, so the sentence can say it. Every field is a
 * complete sentence in the screen's own words; the ones that are not given
 * fall back to a general one.
 */
export interface ErrorContext {
  /** Leads the sentence: "Your reply was not posted." */
  attempt?: string;
  /** A check constraint, keyed on its name: `chat_messages_attachments_check` → "Up to four photographs on one message." */
  constraints?: Record<string, string>;
  /** The unique index refused: "There is already a room with that name." */
  duplicate?: string;
  /** A policy refused: "Only somebody in the room can post here." */
  refused?: string;
  /** `.single()` found nothing, or a foreign key points at nothing: "That message is not there any more." */
  missing?: string;
}

/** Shown when a code this file does not know arrives; the raw text goes to the console. */
export const GENERIC_FAILURE = 'Something went wrong. Try again in a minute.';
/** Shown for every kind of schema drift — never the raw text, which names tables. */
export const UPDATING_FAILURE = 'The club is being updated. Try again in a minute.';
export const OFFLINE_FAILURE = 'You are offline. Check your connection and try again.';

/** Schema drift — the client is ahead of the database, or behind it. */
const DRIFT_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01', '42703']);
/** The codes our own `raise exception` sentences arrive with. */
const OUR_CODES = new Set(['P0001', 'P0002', '22023']);

const RLS = /row-level security/i;
const GRANT = /^permission denied for (column|table|relation|function|view|schema|sequence)/i;
const CHECK = /violates check constraint "([^"]+)"/;
const DRIFT = /in the schema cache|does not exist/;
const OFFLINE =
  /Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET_DISCONNECTED/i;
const ABORTED = /^AbortError\b|user aborted a request|signal is aborted/i;

/**
 * Storage's refusals carry no SQLSTATE, only an HTTP status and a sentence
 * about buckets and mime types. These are the two a bucket's own limits
 * produce; a policy refusing the object row says "row-level security" like
 * any other and is caught below with them.
 */
const STORAGE: [RegExp, string][] = [
  [
    /mime type .* is not supported/i,
    'That file is not a kind of photograph the club can hold. Try a JPEG or a PNG.',
  ],
  [
    /exceeded the maximum allowed size|too large/i,
    'That photograph is still too large after shrinking. Try a smaller one.',
  ],
];

/** GoTrue's codes and, for the versions that send only a message, its wording. */
const AUTH: [RegExp, string][] = [
  [
    /^(otp_expired|invalid_credentials)$|Token has expired|Invalid login credentials/i,
    'That code is not right, or it has expired. Ask for a new one.',
  ],
  [
    /^over_(sms|email)_send_rate_limit$|rate limit|only request this after/i,
    'Too many codes were asked for. Wait a minute and try again.',
  ],
  [
    /^sms_send_failed$|Error sending sms|Unable to send/i,
    'The code could not be sent. Try again in a minute.',
  ],
];

function lead(attempt: string | undefined, rest: string): string {
  return attempt ? `${attempt} ${rest}` : rest;
}

/**
 * The sentence for a failure, given what was being attempted.
 *
 * Takes the error object itself — a `PostgrestError`, an `AuthError`, a
 * `StorageError` or a thrown `Error` — never `error.message`, because once it
 * is a string the code is gone and the only thing left to key on is wording.
 */
export function describeError(error: Failure, context?: string | ErrorContext): string {
  const ctx: ErrorContext = typeof context === 'string' ? { attempt: context } : (context ?? {});
  const message = error.message;
  const code = typeof error.code === 'string' ? error.code : '';

  // supabase-js reports a fetch that never got through as an error whose
  // message is `TypeError: Failed to fetch` and whose code is ''. A thrown
  // TypeError from fetch itself says the same without the prefix.
  if (OFFLINE.test(message)) return OFFLINE_FAILURE;
  // A hook that aborted its own request has already checked for that and
  // returned, so this is the tab leaving mid-write.
  if (error.name === 'AbortError' || ABORTED.test(message)) {
    return lead(ctx.attempt, 'That did not finish. Try again.');
  }

  if (OUR_CODES.has(code)) return message;

  if (code === '42501') {
    if (RLS.test(message)) return lead(ctx.attempt, ctx.refused ?? 'You cannot do that here.');
    // A grant is missing — the client named a column it may not write, or
    // called a function this role cannot. A bug, not a member's doing.
    if (GRANT.test(message)) return unknown(error, ctx);
    // Our own `raise … using errcode = '42501'`: "Not an administrator".
    return message;
  }

  if (code === '23514') return checkConstraint(message, ctx);
  if (code === '23505') return lead(ctx.attempt, ctx.duplicate ?? 'That one is already there.');
  if (code === '23503' || code === 'PGRST116') {
    return lead(ctx.attempt, ctx.missing ?? 'That is not there any more.');
  }
  if (DRIFT_CODES.has(code)) {
    console.error(error);
    return UPDATING_FAILURE;
  }

  for (const [pattern, sentence] of AUTH) {
    if (pattern.test(code) || pattern.test(message)) return sentence;
  }

  if (code) return unknown(error, ctx);

  for (const [pattern, sentence] of STORAGE) {
    if (pattern.test(message)) return lead(ctx.attempt, sentence);
  }

  // No code at all. The database's wording is still recognisable, and a test
  // fixture or a thrown Error is the usual source; sort by phrase.
  if (RLS.test(message)) return lead(ctx.attempt, ctx.refused ?? 'You cannot do that here.');
  if (GRANT.test(message)) return unknown(error, ctx);
  if (CHECK.test(message)) return checkConstraint(message, ctx);
  if (message.includes('duplicate key value violates unique constraint'))
    return lead(ctx.attempt, ctx.duplicate ?? 'That one is already there.');
  if (message.includes('violates foreign key constraint'))
    return lead(ctx.attempt, ctx.missing ?? 'That is not there any more.');
  if (DRIFT.test(message)) {
    console.error(error);
    return UPDATING_FAILURE;
  }
  if (!message) return unknown(error, ctx);
  return message;
}

/**
 * The same, for whatever a `catch` caught. supabase-js returns its failures
 * rather than throwing, so what lands here is a `TypeError` from fetch, an
 * `AbortError`, or something that is not an `Error` at all.
 */
export function describeThrown(thrown: unknown, context?: string | ErrorContext): string {
  if (thrown instanceof Error) return describeError(thrown, context);
  return unknown(
    { message: String(thrown) },
    typeof context === 'string' ? { attempt: context } : (context ?? {}),
  );
}

function checkConstraint(message: string, ctx: ErrorContext): string {
  const name = CHECK.exec(message)?.[1];
  const own = name ? ctx.constraints?.[name] : undefined;
  return lead(
    ctx.attempt,
    own ?? 'Something in it is not allowed: too long, blank, or too many of one thing.',
  );
}

function unknown(error: Failure, ctx: ErrorContext): string {
  console.error(error);
  return lead(ctx.attempt, GENERIC_FAILURE);
}
