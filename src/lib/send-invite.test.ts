import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const { sendInvite } = await import('@/lib/send-invite');

/** What supabase-js hands back for a non-2xx: an error whose `context` is the Response. */
const httpError = (status: number) => ({
  data: null,
  error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status } },
});

beforeEach(() => {
  invoke.mockReset();
});

describe('sendInvite', () => {
  it('asks send-invite for that invite and nothing else', async () => {
    invoke.mockResolvedValue({ data: { sent: true }, error: null });
    await expect(sendInvite('inv-1')).resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('send-invite', { body: { invite_id: 'inv-1' } });
  });

  it.each([
    [404, /not there any more/],
    [409, /no longer waiting/],
    [422, /no email address/],
    [429, /less than a minute/],
    [502, /email service did not take it/],
  ])('says what a %i means in words', async (status, words) => {
    invoke.mockResolvedValue(httpError(status));
    const result = await sendInvite('inv-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(words);
      expect(result.status).toBe(status);
    }
  });

  // A network failure has no Response to read a status from.
  it('still answers in a sentence when there is no status', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'x' } });
    const result = await sendInvite('inv-1');
    expect(result).toEqual({
      ok: false,
      error: 'The email service could not be reached. Try again in a minute.',
    });
  });
});
