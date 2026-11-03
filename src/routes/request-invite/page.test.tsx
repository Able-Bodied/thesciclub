import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { InviteRequest } from '@/lib/invite-requests';

const asked = vi.hoisted(() => ({ requests: [] as unknown[], error: null as string | null }));

type Asked = Pick<InviteRequest, 'name' | 'email' | 'note'>;

vi.mock('@/lib/invite-requests', () => ({
  requestClubInvite: (request: Asked) => {
    asked.requests.push(request);
    return Promise.resolve(
      asked.error ? { ok: false, error: asked.error } : { ok: true, value: null },
    );
  },
}));

const { default: RequestInvitePage } = await import('@/routes/request-invite/page');

function open() {
  return render(
    <MemoryRouter initialEntries={['/request-invite']}>
      <RequestInvitePage />
    </MemoryRouter>,
  );
}

// The owner, 2026-11-02: no list to choose from, the request goes to one person.
describe('asking for an invite', () => {
  it('is a short form with nobody to choose', () => {
    open();
    expect(screen.getByText('Joining The SCI Club is by invitation only.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ask / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  });

  it('sends the name, email and note', async () => {
    asked.requests = [];
    asked.error = null;
    open();
    await userEvent.type(screen.getByLabelText('Your name'), 'Dana Ruiz');
    await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
    await userEvent.type(screen.getByLabelText('A note (optional)'), 'We met at the expo');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(asked.requests).toEqual([
      { name: 'Dana Ruiz', email: 'dana@example.com', note: 'We met at the expo' },
    ]);
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
  });

  it('starts from an event registration on this device', () => {
    window.localStorage.setItem(
      'sciclub.eventRegistration',
      JSON.stringify({
        eventId: 'e1',
        status: 'going',
        name: 'Dana Ruiz',
        email: 'dana@example.com',
        phone: '',
      }),
    );
    open();
    expect(screen.getByLabelText('Your name')).toHaveValue('Dana Ruiz');
    expect(screen.getByLabelText('Email')).toHaveValue('dana@example.com');
    window.localStorage.removeItem('sciclub.eventRegistration');
  });

  it('says why when the request is refused', async () => {
    asked.error = 'Too many requests today. Try again tomorrow.';
    open();
    await userEvent.type(screen.getByLabelText('Your name'), 'Dana');
    await userEvent.type(screen.getByLabelText('Email'), 'dana@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests today.');
    expect(screen.queryByText('Request sent')).toBeNull();
  });
});
