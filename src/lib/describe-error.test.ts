import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  describeError,
  GENERIC_FAILURE,
  OFFLINE_FAILURE,
  UPDATING_FAILURE,
} from '@/lib/describe-error';

/**
 * Every string here is a real one. The PostgREST bodies were copied from the
 * local stack on 2026-09-21 by provoking each refusal as a signed-in member
 * (curl against 127.0.0.1:54321 with a minted JWT); the psql ones by running
 * the same as `set local role authenticated`. None were written from memory,
 * because a translator that matches the wording somebody remembered matches
 * nothing.
 */

let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
});

describe('our own sentences pass through untouched', () => {
  // plpgsql's default errcode. 102 of the 159 raises carry it.
  it('P0001 — a raise with no errcode', () => {
    const error = {
      code: 'P0001',
      message: 'You cannot report your own message. Remove it instead.',
    };
    expect(describeError(error, 'Your report was not sent.')).toBe(
      'You cannot report your own message. Remove it instead.',
    );
  });

  it('P0001 — the 18+ trigger, which is the oldest instance of this bug', () => {
    const error = {
      code: 'P0001',
      message: 'The SCI Club is for adults. You must be 18 or older to join.',
    };
    expect(describeError(error)).toBe(
      'The SCI Club is for adults. You must be 18 or older to join.',
    );
  });

  it('P0002 — no_data_found', () => {
    expect(describeError({ code: 'P0002', message: 'There is no such message.' })).toBe(
      'There is no such message.',
    );
  });

  it('22023 — invalid_parameter_value', () => {
    expect(
      describeError({ code: '22023', message: 'A conversation needs somebody else in it.' }),
    ).toBe('A conversation needs somebody else in it.');
  });

  // Our own `raise … using errcode = '42501'` shares its code with the
  // policies. The phrase is what tells them apart.
  it('42501 without "row-level security" — "Not an administrator"', () => {
    expect(describeError({ code: '42501', message: 'Not an administrator' })).toBe(
      'Not an administrator',
    );
  });

  it('does not add the attempt to a sentence that is already whole', () => {
    expect(
      describeError(
        { code: 'P0001', message: 'Fill your last room before starting another.' },
        'x',
      ),
    ).toBe('Fill your last room before starting another.');
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('a policy refusing a row', () => {
  const error = {
    code: '42501',
    message: 'new row violates row-level security policy for table "chat_messages"',
  };

  it('says the member cannot do that, with what they were doing', () => {
    expect(describeError(error, 'Your message was not sent.')).toBe(
      'Your message was not sent. You cannot do that here.',
    );
  });

  it('takes the screen’s own wording for the refusal', () => {
    expect(describeError(error, { refused: 'Only somebody in the room can post here.' })).toBe(
      'Only somebody in the room can post here.',
    );
  });

  it('never shows the table name', () => {
    expect(describeError(error)).not.toMatch(/chat_messages|row-level/);
  });
});

describe('a missing grant is a bug, not a refusal', () => {
  // What naming `created_at` in an insert produces through PostgREST. In psql
  // the same is `permission denied for column`; both start the same way.
  it('permission denied for table — generic, and loud in the console', () => {
    const error = { code: '42501', message: 'permission denied for table chat_messages' };
    expect(describeError(error, 'Your message was not sent.')).toBe(
      `Your message was not sent. ${GENERIC_FAILURE}`,
    );
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it('permission denied for column', () => {
    const error = { code: '42501', message: 'permission denied for column created_at' };
    expect(describeError(error)).toBe(GENERIC_FAILURE);
  });

  it('permission denied for function — a caller who is not its audience', () => {
    const error = { code: '42501', message: 'permission denied for function my_claimable_profile' };
    expect(describeError(error)).toBe(GENERIC_FAILURE);
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});

describe('a check constraint', () => {
  it('names the screen’s sentence for the constraint the message names', () => {
    const error = {
      code: '23514',
      message:
        'new row for relation "chat_messages" violates check constraint "chat_messages_attachments_check"',
    };
    expect(
      describeError(error, {
        attempt: 'Your message was not sent.',
        constraints: { chat_messages_attachments_check: 'Up to four photographs on one message.' },
      }),
    ).toBe('Your message was not sent. Up to four photographs on one message.');
  });

  it('falls back to a general sentence for a constraint the screen did not name', () => {
    const error = {
      code: '23514',
      message:
        'new row for relation "chat_messages" violates check constraint "chat_messages_check"',
    };
    const sentence = describeError(error, {
      attempt: 'Your message was not sent.',
      constraints: { chat_messages_attachments_check: 'Up to four photographs on one message.' },
    });
    expect(sentence).toMatch(/^Your message was not sent\. /);
    expect(sentence).not.toMatch(/chat_messages|relation|constraint/);
  });
});

describe('the unique index', () => {
  const error = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "invites_live_phone_idx"',
  };

  it('is "already there" in the screen’s words', () => {
    expect(describeError(error, { duplicate: 'That number is already on the club’s list.' })).toBe(
      'That number is already on the club’s list.',
    );
  });

  it('and something honest without them', () => {
    expect(describeError(error)).not.toMatch(/duplicate|constraint|_idx/);
  });
});

describe('nothing there', () => {
  it('PGRST116 — .single() on zero rows', () => {
    const error = {
      code: 'PGRST116',
      message: 'Cannot coerce the result to a single JSON object',
    };
    expect(describeError(error, { missing: 'That conversation is not there any more.' })).toBe(
      'That conversation is not there any more.',
    );
    expect(describeError(error)).toBe('That is not there any more.');
  });

  it('23503 — a foreign key pointing at a row that went', () => {
    const error = {
      code: '23503',
      message:
        'insert or update on table "chat_messages" violates foreign key constraint "chat_messages_thread_id_fkey"',
    };
    expect(describeError(error, 'Your message was not sent.')).toBe(
      'Your message was not sent. That is not there any more.',
    );
  });
});

describe('schema drift is one sentence, never the raw text', () => {
  const cases: [string, string, string][] = [
    [
      'PGRST202',
      'Could not find the function public.chat_my_threads without parameters in the schema cache',
      'a function the database does not have',
    ],
    [
      'PGRST202',
      'Could not find the function public.chat_report_message(message, reason) in the schema cache',
      'a function called with the wrong argument names',
    ],
    ['PGRST205', "Could not find the table 'public.no_such_table' in the schema cache", 'a table'],
    ['42703', 'column chat_rooms.no_such_column does not exist', 'a column'],
    ['42P01', 'relation "no_such_table" does not exist', 'a relation, inside a function'],
    ['42883', 'function no_such_function() does not exist', 'a function, inside a function'],
  ];

  it.each(cases)('%s — %s (%s)', (code, message) => {
    const error = { code, message };
    expect(describeError(error, 'Your conversations could not be loaded.')).toBe(UPDATING_FAILURE);
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});

describe('the network', () => {
  // supabase-js catches the fetch and hands back an error shaped like
  // PostgREST's, with the TypeError's name prefixed and an empty code.
  it('supabase-js wrapping a failed fetch', () => {
    expect(describeError({ code: '', message: 'TypeError: Failed to fetch' })).toBe(
      OFFLINE_FAILURE,
    );
  });

  it('a thrown TypeError from fetch itself, in each browser’s words', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toBe(OFFLINE_FAILURE);
    expect(describeError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      OFFLINE_FAILURE,
    );
    expect(describeError(new TypeError('Load failed'))).toBe(OFFLINE_FAILURE);
  });

  it('an aborted request', () => {
    const error = { code: '', message: 'AbortError: signal is aborted without reason' };
    expect(describeError(error, 'Your message was not sent.')).toBe(
      'Your message was not sent. That did not finish. Try again.',
    );
    const thrown = new DOMException('The user aborted a request.', 'AbortError');
    expect(describeError(thrown)).toBe('That did not finish. Try again.');
  });
});

describe('the photo bucket', () => {
  // storage-js: a StorageApiError with a status and no SQLSTATE. These two
  // are what the bucket's allowed types and size limit produce.
  it('a file that is not a photograph', () => {
    expect(
      describeError(
        { name: 'StorageApiError', message: 'mime type text/plain is not supported' },
        'The photograph did not upload.',
      ),
    ).toBe(
      'The photograph did not upload. That file is not a kind of photograph the club can hold. Try a JPEG or a PNG.',
    );
  });

  it('a file over the bucket limit', () => {
    expect(
      describeError({
        name: 'StorageApiError',
        message: 'The object exceeded the maximum allowed size',
      }),
    ).toMatch(/too large after shrinking/);
  });

  it('a policy on the object row', () => {
    expect(
      describeError(
        { name: 'StorageApiError', message: 'new row violates row-level security policy' },
        { refused: 'You cannot add a photograph here.' },
      ),
    ).toBe('You cannot add a photograph here.');
  });
});

describe('signing in', () => {
  it('a wrong or stale code, by code and by wording', () => {
    expect(
      describeError({ code: 'otp_expired', message: 'Token has expired or is invalid' }),
    ).toMatch(/not right, or it has expired/);
    expect(describeError({ message: 'Token has expired or is invalid' })).toMatch(
      /not right, or it has expired/,
    );
    expect(describeError({ message: 'Invalid login credentials' })).toMatch(
      /not right, or it has expired/,
    );
  });

  it('asking for codes too fast', () => {
    expect(
      describeError({
        code: 'over_sms_send_rate_limit',
        message: 'For security purposes, you can only request this after 59 seconds.',
      }),
    ).toMatch(/Too many codes/);
    expect(describeError({ message: 'Email rate limit exceeded' })).toMatch(/Too many codes/);
  });
});

describe('anything else', () => {
  it('a code this file does not know — generic, and the raw error in the console', () => {
    const error = { code: '22P02', message: 'invalid input syntax for type uuid: "not-a-uuid"' };
    expect(describeError(error, 'The message was not removed.')).toBe(
      `The message was not removed. ${GENERIC_FAILURE}`,
    );
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  // PostgREST always sends a code, so a message with none is a sentence
  // somebody wrote — a test fixture's, or a helper's own.
  it('no code and no recognisable wording — taken to be ours', () => {
    expect(describeError({ message: 'Only an administrator can open or close a room.' })).toBe(
      'Only an administrator can open or close a room.',
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('no code but the database’s wording — sorted by phrase', () => {
    expect(describeError({ message: 'relation "public.chat_rooms" does not exist' })).toBe(
      UPDATING_FAILURE,
    );
    expect(
      describeError({ message: 'new row violates row-level security policy for table "invites"' }),
    ).toBe('You cannot do that here.');
    expect(
      describeError({
        message: 'duplicate key value violates unique constraint "invites_live_phone_idx"',
      }),
    ).toBe('That one is already there.');
  });

  it('an empty message', () => {
    expect(describeError({ message: '' }, 'That did not save.')).toBe(
      `That did not save. ${GENERIC_FAILURE}`,
    );
  });
});
