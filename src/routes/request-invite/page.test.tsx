import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { InviteRequest, InviteRequestChoice } from '@/lib/invite-requests';

const asked = vi.hoisted(() => ({ requests: [] as InviteRequest[], error: null as string | null }));

vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const CHOICES: InviteRequestChoice[] = [
  {
    organizationId: 'o1',
    name: 'NorCal SCI',
    shortCode: 'NCS',
    logoPath: null,
    admins: [
      { id: 'a1', firstName: 'Sam' },
      { id: 'a2', firstName: 'Alfred' },
    ],
  },
];

vi.mock('@/lib/invite-requests', () => ({
  fetchInviteRequestChoices: () => Promise.resolve({ ok: true, value: CHOICES }),
  requestInvite: (request: InviteRequest) => {
    asked.requests.push(request);
    return Promise.resolve(
      asked.error ? { ok: false, error: asked.error } : { ok: true, value: null },
    );
  },
}));

const { default: RequestInvitePage } = await import('@/routes/request-invite/page');

function open(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/request-invite', state }]}>
      <RequestInvitePage />
    </MemoryRouter>,
  );
}

describe('asking for an invite', () => {
  it('says joining is by invitation only and lists org admins by first name', async () => {
    open();
    expect(screen.getByText('Joining The SCI Club is by invitation only.')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Ask Sam from NorCal SCI' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask Alfred from NorCal SCI' })).toBeInTheDocument();
    // No form until somebody is chosen.
    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  it('sends the name, email and note to the one tapped', async () => {
    asked.requests = [];
    asked.error = null;
    open();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ask Alfred from NorCal SCI' }),
    );
    expect(screen.getByText('Ask Alfred from NorCal SCI')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send request to Alfred' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Your name'), 'Dana Ruiz');
    await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
    await userEvent.type(screen.getByLabelText('A note (optional)'), 'We met at the expo');
    await userEvent.click(send);
    expect(asked.requests).toEqual([
      {
        organizationId: 'o1',
        adminId: 'a2',
        name: 'Dana Ruiz',
        email: 'dana@example.com',
        note: 'We met at the expo',
      },
    ]);
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
  });

  it('opens with the admin chosen on the blocked screen', async () => {
    open({ picked: { organizationId: 'o1', adminId: 'a1' } });
    expect(await screen.findByText('Ask Sam from NorCal SCI')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });

  it('says why when the request is refused', async () => {
    asked.error = 'Too many requests today. Try again tomorrow.';
    open({ picked: { organizationId: 'o1', adminId: 'a1' } });
    await userEvent.type(await screen.findByLabelText('Your name'), 'Dana');
    await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send request to Sam' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests today.');
    expect(screen.queryByText('Request sent')).toBeNull();
  });
});
