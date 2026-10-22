import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const answer = vi.hoisted(() => ({
  data: [] as Record<string, string | number | null>[] | null,
  error: null as { message: string } | null,
  asked: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: (name: string) => {
      answer.asked.push(name);
      return Promise.resolve({ data: answer.data, error: answer.error });
    },
  }),
}));

const { AppleNotices } = await import('@/routes/admin/apple-notices');

beforeEach(() => {
  answer.data = [];
  answer.error = null;
  answer.asked = [];
});

describe('Apple’s notices on the Sign-in tab', () => {
  it('says what Apple told the club, newest first as the club keeps them', async () => {
    answer.data = [
      {
        kind: 'email-disabled',
        received_at: '2026-10-21T18:00:00Z',
        member_id: 'm1',
        display_name: 'Dana',
      },
      {
        kind: 'account-delete',
        received_at: '2026-10-20T18:00:00Z',
        member_id: 'm2',
        display_name: 'Sam',
      },
    ];
    render(<AppleNotices />);
    expect(
      await screen.findByText(/Dana’s Hide My Email address stopped forwarding/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sam deleted their Apple Account\. Their club account is still here/),
    ).toBeInTheDocument();
    expect(screen.getByText('October 21, 2026')).toBeInTheDocument();
    expect(answer.asked).toEqual(['admin_apple_notices']);
  });

  it('says first when revoking deleted accounts’ Apple sign-ins was given up', async () => {
    answer.data = [
      {
        kind: 'revoke-abandoned',
        received_at: '2026-10-22T16:40:00Z',
        member_id: null,
        display_name: null,
        how_many: 2,
        detail: 'HTTP 400 invalid_client',
      },
      {
        kind: 'consent-revoked',
        received_at: '2026-10-20T18:00:00Z',
        member_id: 'm1',
        display_name: 'Dana',
        how_many: null,
        detail: null,
      },
    ];
    render(<AppleNotices />);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'Apple was not told to end Sign in with Apple for 2 deleted accounts, after seven tries (HTTP 400 invalid_client).',
    );
    expect(items[0]).toHaveTextContent('check the apple-revoke function');
    expect(items[1]).toHaveTextContent(/Dana stopped using Sign in with Apple/);
  });

  it('says what will appear when there is nothing', async () => {
    render(<AppleNotices />);
    expect(await screen.findByText(/Nothing yet\./)).toBeInTheDocument();
  });

  it('says when it could not read them', async () => {
    answer.error = { message: 'Only an administrator can do that.' };
    render(<AppleNotices />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
