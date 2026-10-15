import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_ONBOARDING_DATA } from '@/routes/onboarding/types';

const api = vi.hoisted(() => ({
  row: null as null | { step: string; answers: unknown; updated_at: string },
  saved: [] as { name: string; args: unknown }[],
  fail: false,
}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string, args?: unknown) => {
      if (api.fail) return Promise.reject(new Error('offline'));
      if (name === 'my_onboarding_progress')
        return Promise.resolve({ data: api.row ? [api.row] : [], error: null });
      api.saved.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  }),
}));

const { forgetOnDevice, keptAnswers, readFromDevice, saveOnDevice, saveToAccount, savedProgress } =
  await import('@/routes/onboarding/progress');

const DATA = {
  ...INITIAL_ONBOARDING_DATA,
  email: 'dana@example.com',
  password: 'correct horse',
  passwordAgain: 'correct horse',
  zip: '95008',
  termsAgreed: true,
  displayName: 'Dana',
  username: 'dana',
  exactLevel: 'T4' as const,
};

beforeEach(() => {
  window.localStorage.clear();
  api.row = null;
  api.saved = [];
  api.fail = false;
});

describe('what is kept', () => {
  it('never the password, the email, the ZIP or the photograph', () => {
    const kept = keptAnswers({ ...DATA, photoFile: new File(['x'], 'me.jpg') });
    expect(kept).toMatchObject({ termsAgreed: true, displayName: 'Dana', exactLevel: 'T4' });
    for (const key of ['email', 'password', 'passwordAgain', 'zip', 'photoFile', 'photoPreviewUrl'])
      expect(kept).not.toHaveProperty(key);
  });

  it('sends the account only what is kept', async () => {
    await saveToAccount('injury', DATA);
    expect(api.saved).toHaveLength(1);
    expect(api.saved[0]?.name).toBe('save_onboarding_progress');
    expect(JSON.stringify(api.saved[0]?.args)).not.toContain('correct horse');
  });

  it('never stands in the way when the account cannot be reached', async () => {
    api.fail = true;
    await expect(saveToAccount('name', DATA)).resolves.toBeUndefined();
    await expect(savedProgress('user-1')).resolves.toBeNull();
  });
});

describe('on the device', () => {
  it('keeps the step and the answers under the account, and lets them go', () => {
    saveOnDevice('user-1', 'city', DATA);
    expect(readFromDevice('user-1')).toMatchObject({ step: 'city', answers: { username: 'dana' } });
    expect(readFromDevice('user-2')).toBeNull();
    expect(window.localStorage.getItem('sciclub.onboarding.user-1')).not.toContain('correct horse');
    forgetOnDevice('user-1');
    expect(readFromDevice('user-1')).toBeNull();
  });

  it('ignores something that is not a saved step', () => {
    window.localStorage.setItem('sciclub.onboarding.user-1', '{"step":"welcome","answers":{}}');
    expect(readFromDevice('user-1')).toBeNull();
    window.localStorage.setItem('sciclub.onboarding.user-1', 'not json');
    expect(readFromDevice('user-1')).toBeNull();
  });
});

describe('picking up', () => {
  it('takes the account’s copy on a new device', async () => {
    api.row = { step: 'phone', answers: { username: 'dana' }, updated_at: '2026-10-15T20:00:00Z' };
    expect(await savedProgress('user-1')).toMatchObject({ step: 'phone' });
  });

  it('takes whichever copy is newer', async () => {
    saveOnDevice('user-1', 'photo', DATA);
    api.row = { step: 'name', answers: {}, updated_at: '2020-01-01T00:00:00Z' };
    expect(await savedProgress('user-1')).toMatchObject({ step: 'photo' });
    api.row = { step: 'name', answers: {}, updated_at: '2099-01-01T00:00:00Z' };
    expect(await savedProgress('user-1')).toMatchObject({ step: 'name' });
  });
});
