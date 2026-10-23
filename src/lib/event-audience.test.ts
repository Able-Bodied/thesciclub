import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetPendingRegistration,
  type Guest,
  guestListCsv,
  keepPendingRegistration,
  pendingRegistration,
  publicEventUrl,
} from '@/lib/event-audience';

const guest = (o: Partial<Guest> = {}): Guest => ({
  name: 'Maria Lopez',
  email: 'maria@example.com',
  phone: '(408) 555-0112',
  status: 'going',
  state: 'unconfirmed',
  respondedAt: '2026-10-22T18:00:00Z',
  ...o,
});

describe('the guest list as a spreadsheet', () => {
  it('has a header and a row per guest, saying whether they are in the club', () => {
    const csv = guestListCsv([guest(), guest({ name: 'Sam', state: 'member', phone: null })]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Name,Email,Phone,Response,In the club,Responded');
    expect(lines[1]).toBe(
      'Maria Lopez,maria@example.com,(408) 555-0112,going,Not confirmed,2026-10-22T18:00:00Z',
    );
    expect(lines[2]).toContain('Sam,maria@example.com,,going,Member');
  });

  it('quotes commas and quotes', () => {
    expect(guestListCsv([guest({ name: 'Lopez, "Mia"' })])).toContain('"Lopez, ""Mia"""');
  });

  // Anybody types these on a public page: a formula must stay text.
  it('keeps a typed formula from running in the organizer’s spreadsheet', () => {
    const csv = guestListCsv([guest({ name: '=HYPERLINK("http://x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe('the registration kept on this device', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps it until it is let go', () => {
    keepPendingRegistration({
      eventId: 'e1',
      status: 'interested',
      name: 'Maria',
      email: 'maria@example.com',
      phone: '',
      organizer: 'NorCal SCI',
    });
    expect(pendingRegistration()).toMatchObject({
      eventId: 'e1',
      status: 'interested',
      organizer: 'NorCal SCI',
    });
    forgetPendingRegistration();
    expect(pendingRegistration()).toBeNull();
  });

  it('ignores something that is not one', () => {
    window.localStorage.setItem('sciclub.eventRegistration', '{"eventId":3}');
    expect(pendingRegistration()).toBeNull();
    window.localStorage.setItem('sciclub.eventRegistration', 'nope');
    expect(pendingRegistration()).toBeNull();
  });
});

it('shares a public event at thesciclub.com/e/', () => {
  expect(publicEventUrl('abc')).toBe('https://thesciclub.com/e/abc');
});
