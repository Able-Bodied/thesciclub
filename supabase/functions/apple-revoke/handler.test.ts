// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AppleAnswer } from '../_shared/apple.ts';
import { type Deps, type DueRow, revokeDue } from './handler.ts';

const SECRET = 'from-the-vault';

function setup(rows: DueRow[] | null, answers: Record<string, AppleAnswer>) {
  const log = {
    revoked: [] as string[],
    done: [] as string[],
    lines: [] as string[],
    asked: [] as string[],
  };
  const deps: Deps = {
    // The database's check, as apple_revocations_due makes it.
    due: (secret) => {
      log.asked.push(secret);
      return Promise.resolve(secret === SECRET ? rows : 'refused');
    },
    revoke: (client, token) => {
      log.revoked.push(`${client}|${token}`);
      return Promise.resolve(answers[token] ?? { status: 200, body: {} });
    },
    done: (id, error) => {
      log.done.push(`${id}:${error ?? 'gone'}`);
      return Promise.resolve();
    },
    log: (line) => log.lines.push(line),
  };
  return { deps, log };
}

describe('apple-revoke', () => {
  it('revokes each token as the client that issued it, and lets the accepted ones go', async () => {
    const { deps, log } = setup(
      [
        { id: 1, client_id: 'com.thesciclub.app', refresh_token: 'rt-app' },
        { id: 2, client_id: 'com.thesciclub.web', refresh_token: 'rt-web' },
      ],
      {},
    );
    expect(await revokeDue(SECRET, deps)).toEqual({ status: 200, body: { revoked: 2, failed: 0 } });
    expect(log.revoked).toEqual(['com.thesciclub.app|rt-app', 'com.thesciclub.web|rt-web']);
    expect(log.done).toEqual(['1:gone', '2:gone']);
  });

  it('counts a token Apple no longer knows as done: the member already revoked it', async () => {
    const { deps, log } = setup(
      [{ id: 3, client_id: 'com.thesciclub.app', refresh_token: 'rt-old' }],
      { 'rt-old': { status: 400, body: { error: 'invalid_grant' } } },
    );
    await revokeDue(SECRET, deps);
    expect(log.done).toEqual(['3:gone']);
  });

  it('keeps a refused or unreachable one with its error, and logs no token', async () => {
    const { deps, log } = setup(
      [
        { id: 4, client_id: 'com.thesciclub.app', refresh_token: 'rt-refused' },
        { id: 5, client_id: 'com.thesciclub.web', refresh_token: 'rt-offline' },
        { id: 6, client_id: 'com.example', refresh_token: 'rt-odd' },
      ],
      {
        'rt-refused': { status: 400, body: { error: 'invalid_client' } },
        'rt-offline': { status: 0, body: { error: 'unreachable' } },
      },
    );
    expect(await revokeDue(SECRET, deps)).toEqual({ status: 200, body: { revoked: 0, failed: 3 } });
    expect(log.done).toEqual([
      '4:HTTP 400 invalid_client',
      '5:HTTP 0 unreachable',
      '6:unknown client com.example',
    ]);
    expect(log.revoked).not.toContain('com.example|rt-odd');
    expect(log.lines.join('\n')).not.toMatch(/rt-/);
  });

  it('refuses a caller without the secret before asking the database', async () => {
    const { deps, log } = setup(
      [{ id: 7, client_id: 'com.thesciclub.app', refresh_token: 'rt-x' }],
      {},
    );
    expect(await revokeDue(null, deps)).toEqual({
      status: 401,
      body: { error: 'not the database' },
    });
    expect(await revokeDue('', deps)).toMatchObject({ status: 401 });
    expect(log.asked).toEqual([]);
    expect(log.revoked).toEqual([]);
  });

  it('refuses a wrong secret, and asks Apple nothing', async () => {
    const { deps, log } = setup(
      [{ id: 7, client_id: 'com.thesciclub.app', refresh_token: 'rt-x' }],
      {},
    );
    expect(await revokeDue('guess', deps)).toMatchObject({ status: 401 });
    expect(log.asked).toEqual(['guess']);
    expect(log.revoked).toEqual([]);
    expect(log.done).toEqual([]);
  });

  it('says so when the queue cannot be read', async () => {
    const { deps } = setup(null, {});
    expect((await revokeDue(SECRET, deps)).status).toBe(502);
  });
});
