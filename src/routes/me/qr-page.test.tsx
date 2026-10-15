import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { Account } from '@/lib/account';
import { AnnounceProvider } from '@/lib/announce';
import type { MyQrCode } from '@/lib/qr-codes';

const state = vi.hoisted(() => ({
  account: null as Account | null,
  accountEmail: 'alfred@example.com',
  joiningOpen: true,
  codes: [] as MyQrCode[],
  created: [] as [string | null, string][],
  turnedOff: [] as string[],
  shared: [] as { url: string; title: string; text: string }[],
  shareOutcome: 'shared',
  createError: null as string | null,
}));

vi.mock('@/lib/account', () => ({ useAccount: () => state.account }));
vi.mock('@/lib/account-email', () => ({
  loadSignInDetails: () => Promise.resolve({ ok: true, details: { email: state.accountEmail } }),
}));
vi.mock('@/lib/joining', () => ({
  fetchJoiningIsOpen: () => Promise.resolve(state.joiningOpen),
}));
vi.mock('@/lib/qr-codes', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMyQrCodes: () => Promise.resolve({ ok: true, codes: state.codes }),
  createQrCode: (eventName: string | null, email: string) => {
    state.created.push([eventName, email]);
    if (state.createError) return Promise.resolve({ ok: false, error: state.createError });
    const code: MyQrCode = {
      id: `new-${state.created.length}`,
      code: 'fresh0code',
      eventName,
      contactEmail: email,
      createdAt: '2026-10-14T17:00:00Z',
      turnedOffAt: null,
    };
    state.codes = [code, ...state.codes];
    return Promise.resolve({ ok: true, code });
  },
  turnOffQrCode: (id: string) => {
    state.turnedOff.push(id);
    state.codes = state.codes.map((c) =>
      c.id === id ? { ...c, turnedOffAt: '2026-10-15T18:00:00Z' } : c,
    );
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/lib/share-link', () => ({
  shareLink: (link: { url: string; title: string; text: string }) => {
    state.shared.push(link);
    return Promise.resolve(state.shareOutcome);
  },
}));

const { default: QrCodePage } = await import('@/routes/me/qr-page');

let confirmSpy: MockInstance<typeof window.confirm>;

const code = (o: Partial<MyQrCode> = {}): MyQrCode => ({
  id: 'q1',
  code: 'abc123',
  eventName: 'Abilities Expo LA',
  contactEmail: 'alfred@example.com',
  createdAt: '2026-10-14T17:00:00Z',
  turnedOffAt: null,
  ...o,
});

function renderPage() {
  return render(
    <AnnounceProvider>
      <MemoryRouter initialEntries={['/me/qr']}>
        <Routes>
          <Route path="/me/qr" element={<QrCodePage />} />
          <Route path="/me" element={<h1>Me</h1>} />
          <Route path="/admin" element={<h1>Admin</h1>} />
        </Routes>
      </MemoryRouter>
    </AnnounceProvider>,
  );
}

beforeEach(() => {
  state.account = { status: 'member', userId: 'me', isAdmin: true, displayName: 'Alfred' };
  state.accountEmail = 'alfred@example.com';
  state.joiningOpen = true;
  state.codes = [];
  state.created = [];
  state.turnedOff = [];
  state.shared = [];
  state.shareOutcome = 'shared';
  state.createError = null;
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  confirmSpy.mockClear();
});

describe('who may make a code', () => {
  it('sends a member who is not an administrator back to Me', async () => {
    state.account = { status: 'member', userId: 'me', isAdmin: false, displayName: 'Sam' };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Me' })).toBeInTheDocument();
  });
});

describe('making a code', () => {
  it('fills in the account email, and lets it be changed', async () => {
    renderPage();
    const email = screen.getByLabelText('Email shown while joining is closed');
    await waitFor(() => {
      expect(email).toHaveValue('alfred@example.com');
    });
    await userEvent.clear(email);
    await userEvent.type(email, 'hello@thesciclub.com');
    expect(email).toHaveValue('hello@thesciclub.com');
  });

  it('does not overwrite an address typed before the account email arrives', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const late = new Promise((resolve) => {
      answer = resolve;
    });
    const accountEmail = await import('@/lib/account-email');
    const spy = vi.spyOn(accountEmail, 'loadSignInDetails').mockReturnValue(late as never);
    renderPage();
    await userEvent.type(screen.getByLabelText('Email shown while joining is closed'), 'me@x.com');
    answer({ ok: true, details: { email: 'alfred@example.com' } });
    await late;
    expect(screen.getByLabelText('Email shown while joining is closed')).toHaveValue('me@x.com');
    spy.mockRestore();
  });

  it('wants an event name, unless No event is chosen', async () => {
    renderPage();
    const make = screen.getByRole('button', { name: 'Make the QR code' });
    await waitFor(() => {
      expect(screen.getByLabelText('Email shown while joining is closed')).toHaveValue(
        'alfred@example.com',
      );
    });
    expect(make).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'No event' }));
    expect(screen.queryByLabelText('Event name')).toBeNull();
    expect(make).toBeEnabled();
  });

  it('makes it with the event and email, and shows it', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Email shown while joining is closed')).toHaveValue(
        'alfred@example.com',
      );
    });
    await userEvent.type(screen.getByLabelText('Event name'), '  Abilities Expo LA ');
    await userEvent.click(screen.getByRole('button', { name: 'Make the QR code' }));
    expect(state.created).toEqual([['Abilities Expo LA', 'alfred@example.com']]);
    const shown = await screen.findByRole('dialog', { name: 'Abilities Expo LA' });
    expect(
      within(shown).getByRole('img', { name: "QR code that opens the club's join page" }),
    ).toBeInTheDocument();
    expect(within(shown).getByText(/invited by Alfred/)).toBeInTheDocument();
  });

  it('makes one with no event', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'No event' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Make the QR code' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Make the QR code' }));
    expect(state.created).toEqual([[null, 'alfred@example.com']]);
    expect(await screen.findByRole('dialog', { name: 'The SCI Club' })).toBeInTheDocument();
  });

  it('says why the database refused it', async () => {
    state.createError = 'Enter an email address people can write to.';
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'No event' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Make the QR code' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Make the QR code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an email address');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('while joining is invite only', () => {
  it('warns first that the code lets nobody in, and points to the switch', async () => {
    state.joiningOpen = false;
    renderPage();
    expect(await screen.findByText('Joining is invite only right now.')).toBeInTheDocument();
    expect(screen.getByText(/They'll see your email so they can ask you/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Let anybody join, in Admin' }));
    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('says nothing of the kind while anybody can join', async () => {
    renderPage();
    await screen.findByText('You have not made a code yet.');
    expect(screen.queryByText('Joining is invite only right now.')).toBeNull();
  });
});

describe('sharing it', () => {
  it('shares the same address the code opens', async () => {
    state.codes = [code()];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
    await userEvent.click(screen.getByRole('button', { name: 'Share the link' }));
    expect(state.shared).toEqual([
      {
        url: `${window.location.origin}/join?from=abc123`,
        title: 'The SCI Club',
        text: 'Alfred invited you to The SCI Club.',
      },
    ]);
  });

  it('says the link was copied where there is no share sheet', async () => {
    state.codes = [code()];
    state.shareOutcome = 'copied';
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
    await userEvent.click(screen.getByRole('button', { name: 'Share the link' }));
    expect(await screen.findByText('Link copied.', { selector: 'p' })).toBeInTheDocument();
  });

  it('closes with Done', async () => {
    state.codes = [code()];
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the list of codes', () => {
  it('lists each code, and turns one off after asking', async () => {
    state.codes = [code(), code({ id: 'q2', eventName: null, code: 'def456' })];
    renderPage();
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Abilities Expo LA')).toBeInTheDocument();
    expect(within(list).getByText('No event')).toBeInTheDocument();
    expect(screen.getAllByText(/shows alfred@example.com while closed/)).toHaveLength(2);
    const [first] = screen.getAllByRole('button', { name: 'Turn off' });
    if (!first) throw new Error('no Turn off');
    await userEvent.click(first);
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(state.turnedOff).toEqual(['q1']);
    expect(await screen.findByText(/turned off Oct 15/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Turn off' })).toHaveLength(1);
  });

  it('turns nothing off on Cancel', async () => {
    state.codes = [code()];
    confirmSpy.mockReturnValue(false);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(state.turnedOff).toEqual([]);
  });

  it('offers nothing on a code already turned off', async () => {
    state.codes = [code({ turnedOffAt: '2026-10-15T18:00:00Z' })];
    renderPage();
    expect(await screen.findByText(/turned off Oct 15/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
  });
});
