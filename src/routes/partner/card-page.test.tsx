import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AnnounceProvider } from '@/lib/announce';
import type { PartnerCard } from '@/lib/partner-hub';
import type { NewQrCode } from '@/lib/qr-codes';

/** A club partner's card (20261029100000). Only the reads and writes are stubbed. */
const state = vi.hoisted(() => ({
  account: null as Account | null,
  partner: true,
  card: null as PartnerCard | null,
  saved: [] as [string, string][],
  made: [] as NewQrCode[],
}));

vi.mock('@/lib/account', () => ({ useAccount: () => state.account }));
vi.mock('@/lib/club-partners', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIAmPartner: () => state.partner,
}));
vi.mock('@/lib/partner-hub', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMyPartnerCard: () => Promise.resolve({ ok: true, value: state.card }),
  saveMyPartnerCard: (heading: string, body: string) => {
    state.saved.push([heading, body]);
    return Promise.resolve({ ok: true, value: null });
  },
}));
vi.mock('@/lib/qr-codes', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createQrCode: (made: NewQrCode) => {
    state.made.push(made);
    return Promise.resolve({
      ok: true,
      code: {
        id: 'q1',
        code: 'card0code',
        organizationId: null,
        eventName: null,
        contactEmail: null,
        createdAt: '2026-10-29T00:00:00Z',
        expiresAt: null,
        notes: 'Printed card',
        turnedOffAt: null,
        madeAsPartner: true,
      },
    });
  },
}));

const { default: PartnerCardPage } = await import('@/routes/partner/card-page');

function renderPage() {
  return render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={['/partner/card']}>
        <Routes>
          <Route path="/partner/card" element={<PartnerCardPage />} />
          <Route path="/partner" element={<h1>Partner page</h1>} />
        </Routes>
      </MemoryRouter>
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  state.account = { status: 'member', userId: 'bobby', isAdmin: false, displayName: 'Bobby Diaz' };
  state.partner = true;
  state.card = { title: 'Physical therapist, SCI-FIT', heading: null, body: null };
  state.saved = [];
  state.made = [];
});

const preview = () => screen.getByRole('region', { name: 'Preview' });

describe('the card', () => {
  it('sends anybody who is not a partner to the partner page', async () => {
    state.partner = false;
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Partner page' })).toBeInTheDocument();
  });

  it('asks for their own code, with no organization and no expiry, and shows it', async () => {
    renderPage();
    await waitFor(() => {
      expect(state.made).toHaveLength(1);
    });
    expect(state.made[0]).toEqual({
      organizationId: null,
      eventName: null,
      contactEmail: null,
      expiresAt: null,
      notes: 'Printed card',
    });
    expect(
      await within(preview()).findByRole('img', {
        name: "QR code that opens the club's join page",
      }),
    ).toBeInTheDocument();
    expect(within(preview()).getByText(/\/join\?from=card0code|card0code/)).toBeInTheDocument();
  });

  it('shows their name and title, and the defaults while the words are empty', async () => {
    renderPage();
    expect(await within(preview()).findByText('Physical therapist, SCI-FIT')).toBeInTheDocument();
    expect(within(preview()).getByText('Bobby Diaz')).toBeInTheDocument();
    expect(within(preview()).getByText('Meet people who get it')).toBeInTheDocument();
    expect(within(preview()).getByText(/private community for adults/)).toBeInTheDocument();
  });

  it('previews what is typed, counts it, and saves it', async () => {
    renderPage();
    const heading = await screen.findByLabelText('Heading');
    await waitFor(() => {
      expect(heading).toBeEnabled();
    });
    await userEvent.type(heading, 'Ask me about SCI-FIT');
    await userEvent.type(screen.getByLabelText('What it says'), 'Come try a session.');
    expect(within(preview()).getByText('Ask me about SCI-FIT')).toBeInTheDocument();
    expect(within(preview()).getByText('Come try a session.')).toBeInTheDocument();
    expect(screen.getByText('20 of 80')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save the card' }));
    expect(state.saved).toEqual([['Ask me about SCI-FIT', 'Come try a session.']]);
  });

  it('keeps what they saved before', async () => {
    state.card = {
      title: 'Peer support lead',
      heading: 'Talk to someone who has been there',
      body: null,
    };
    renderPage();
    expect(await screen.findByLabelText('Heading')).toHaveValue(
      'Talk to someone who has been there',
    );
  });

  it('prints at half letter, or as a sheet of business cards', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { container } = renderPage();
    const button = await screen.findByRole('button', { name: 'Print' });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    expect(container.querySelector('[data-print-card="half-letter"]')?.children).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Business cards' }));
    expect(container.querySelector('[data-print-card="business"]')?.children).toHaveLength(8);
    await userEvent.click(button);
    expect(print).toHaveBeenCalledOnce();
  });
});
