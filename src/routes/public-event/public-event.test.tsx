import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EventAudience from '@/lib/event-audience';
import type { PublicEvent, Registration } from '@/lib/event-audience';

/**
 * The public event page and its registration form (20261022180000,
 * 20261022190000). The database is stubbed: what is tested is what the
 * page shows, and what it never shows.
 */

const api = vi.hoisted(() => ({
  event: null as PublicEvent | null,
  registered: [] as Registration[],
  kept: [] as Registration[],
  refuse: null as string | null,
  status: 'signed-out',
}));
vi.mock('@/lib/event-audience', async (importOriginal) => ({
  ...(await importOriginal<typeof EventAudience>()),
  fetchPublicEvent: () => Promise.resolve({ ok: true, value: api.event }),
  registerForEvent: (registration: Registration) => {
    api.registered.push(registration);
    return Promise.resolve(
      api.refuse ? { ok: false, error: api.refuse } : { ok: true, value: null },
    );
  },
  keepPendingRegistration: (registration: Registration) => {
    api.kept.push(registration);
  },
}));
vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: api.status, userId: null, isAdmin: false, displayName: null }),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { default: PublicEventPage } = await import('@/routes/public-event/page');
const { default: RegisterForEventPage } = await import('@/routes/public-event/register');

const EVENT: PublicEvent = {
  id: 'picnic',
  title: 'Friday Happy Hour',
  description: 'Join us on the patio. **Everyone is welcome.**',
  descriptionHtml: '',
  startTime: '2099-10-30T01:30:00Z',
  endTime: '2099-10-30T03:00:00Z',
  allDay: false,
  timezone: 'America/Los_Angeles',
  location: 'Lakeside Park',
  city: 'Oakland',
  state: 'CA',
  format: 'in_person',
  url: null,
  registrationUrl: null,
  photoPath: null,
  photoAlt: null,
  organization: { id: 'ncs', name: 'NorCal SCI', shortCode: 'NCS', logoPath: null },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/e/:id" element={<PublicEventPage />} />
        <Route path="/e/:id/register" element={<RegisterForEventPage />} />
        <Route path="/join" element={<h1>Welcome</h1>} />
        <Route path="/events/:id" element={<h1>The members' page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.event = EVENT;
  api.registered = [];
  api.kept = [];
  api.refuse = null;
  api.status = 'signed-out';
});

describe('the public event page', () => {
  it('shows the event and its host, and nothing about who is going', async () => {
    renderAt('/e/picnic');
    expect(await screen.findByRole('heading', { name: 'Friday Happy Hour' })).toBeInTheDocument();
    expect(screen.getByText(/Lakeside Park · Oakland/)).toBeInTheDocument();
    expect(screen.getByText('NorCal SCI')).toBeInTheDocument();
    expect(screen.getByText('Everyone is welcome.')).toBeInTheDocument();
    // No counts and no attendees: the only "going" is the button, and the
    // line saying members see who is.
    expect(screen.queryByText(/\d+ (going|interested)/i)).toBeNull();
    expect(screen.getAllByText(/going/i).map((el) => el.textContent)).toEqual([
      'Going',
      expect.stringContaining("see who's going"),
    ]);
  });

  it('says "Join online" for a meeting link, to anybody with the page', async () => {
    api.event = { ...EVENT, format: 'online', url: 'https://us02web.zoom.us/j/123' };
    renderAt('/e/picnic');
    const join = await screen.findByRole('link', {
      name: 'Join online, opens Zoom',
    });
    expect(join).toHaveAttribute('href', 'https://us02web.zoom.us/j/123');
    expect(screen.queryByText('Details on their site')).toBeNull();
  });

  it('keeps "Details on their site" for any other link', async () => {
    api.event = { ...EVENT, url: 'https://norcalsci.org/happy-hour' };
    renderAt('/e/picnic');
    expect(await screen.findByRole('link', { name: 'Details on their site' })).toHaveAttribute(
      'href',
      'https://norcalsci.org/happy-hour',
    );
    expect(screen.queryByText('Join online')).toBeNull();
  });

  it('opens the form from Going', async () => {
    renderAt('/e/picnic');
    await userEvent.click(await screen.findByRole('button', { name: 'Going' }));
    expect(
      await screen.findByRole('heading', { name: 'Register for this event' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Going' })).toBeChecked();
  });

  it('says so for an event with no public page', async () => {
    api.event = null;
    renderAt('/e/private');
    expect(await screen.findByText('This event has no public page')).toBeInTheDocument();
  });

  it('sends a member to the members’ page', async () => {
    api.status = 'member';
    renderAt('/e/picnic');
    expect(await screen.findByRole('heading', { name: "The members' page" })).toBeInTheDocument();
  });
});

describe('registering', () => {
  async function fill() {
    await userEvent.type(await screen.findByLabelText('Your name'), 'Maria Lopez');
    await userEvent.type(screen.getByLabelText('Email'), 'maria@example.com');
    await userEvent.type(screen.getByLabelText('Phone (optional)'), '4085550112');
  }

  it('needs a name and an email before it can be sent', async () => {
    renderAt('/e/picnic/register?status=interested');
    expect(await screen.findByRole('radio', { name: 'Interested' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Your name'), 'Maria');
    await userEvent.type(screen.getByLabelText('Email'), 'not an email');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('keeps the registration, then opens the welcome page', async () => {
    renderAt('/e/picnic/register?status=going');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(api.registered[0]).toMatchObject({
      eventId: 'picnic',
      status: 'going',
      name: 'Maria Lopez',
      email: 'maria@example.com',
      phone: '(408) 555-0112',
    });
    expect(api.kept[0]).toMatchObject({
      eventId: 'picnic',
      email: 'maria@example.com',
      organizer: 'NorCal SCI',
    });
  });

  it('stays on the form and says why when it is refused', async () => {
    api.refuse = 'Too many registrations just now. Try again in a minute.';
    renderAt('/e/picnic/register');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many registrations/);
    expect(api.kept).toHaveLength(0);
  });

  it('tells them who sees what they type', async () => {
    renderAt('/e/picnic/register');
    expect(
      await screen.findByText(/organizer and the club's administrators see these/),
    ).toBeInTheDocument();
  });
});
