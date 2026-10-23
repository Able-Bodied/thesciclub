import { describeError, describeThrown } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';
import type { EventAudience, RsvpStatus } from '@/types/domain';

/**
 * Who can see an event, its public page, and registering from it
 * (the owner, 2026-10-22; 20261022180000 and 20261022190000).
 *
 * The database decides every one of these: can_see_event() for members,
 * public_event() for anybody with the link, event_guest_list() for the
 * event's organizers. Nothing here filters on its own account.
 */

type Failure = Parameters<typeof describeError>[0];
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(
  name: string,
  args: Record<string, unknown>,
  refusal: string,
): Promise<Result<T>> {
  try {
    const { data, error } = (await getSupabase().rpc(name, args)) as {
      data: T;
      error: Failure | null;
    };
    if (error) return { ok: false, error: describeError(error, refusal) };
    return { ok: true, value: data };
  } catch (thrown) {
    return { ok: false, error: describeThrown(thrown, refusal) };
  }
}

/* --------------------------------------------------------------- audience */

/** For the event form, after saving: this date and, in a series, every later one. */
export function setEventAudience(
  eventId: string,
  audience: EventAudience,
  groups: string[],
): Promise<Result<null>> {
  return call<null>(
    'set_event_audience',
    { event: eventId, audience, groups: audience === 'groups' ? groups : [] },
    'Who can see the event was not saved.',
  );
}

/** The group chats a groups-only event is for, for the form that changes it. */
export async function fetchAudienceGroups(eventId: string): Promise<string[]> {
  const result = await call<string[] | null>(
    'event_audience_groups_of',
    { event: eventId },
    'Could not read the groups.',
  );
  return result.ok ? (result.value ?? []) : [];
}

export interface AudienceHint {
  audience: EventAudience;
  /** Only for a followers event: whose followers. */
  organization: { id: string; name: string; shortCode: string; logoPath: string | null } | null;
}

interface HintRow {
  audience: EventAudience;
  organization_id: string | null;
  organization_name: string | null;
  organization_short_code: string | null;
  organization_logo_path: string | null;
}

/**
 * For a member who cannot see an event, from a link: who it is for, and
 * nothing else. Null when there is no such event, or they can see it.
 */
export async function fetchAudienceHint(eventId: string): Promise<AudienceHint | null> {
  const result = await call<HintRow[] | null>(
    'event_audience_hint',
    { event: eventId },
    'Could not check the event.',
  );
  const row = result.ok ? result.value?.[0] : undefined;
  if (!row) return null;
  return {
    audience: row.audience,
    organization:
      row.organization_id && row.organization_name
        ? {
            id: row.organization_id,
            name: row.organization_name,
            shortCode: row.organization_short_code ?? '',
            logoPath: row.organization_logo_path,
          }
        : null,
  };
}

/* ------------------------------------------------------------ public page */

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  timezone: string | null;
  location: string;
  city: string | null;
  state: string | null;
  format: string | null;
  url: string | null;
  registrationUrl: string | null;
  photoPath: string | null;
  photoAlt: string | null;
  organization: { id: string; name: string; shortCode: string; logoPath: string | null } | null;
}

interface PublicEventRow {
  id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean | null;
  timezone: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  event_format: string | null;
  url: string | null;
  registration_url: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_short_code: string | null;
  organization_logo_path: string | null;
}

/** A public event, for anybody with the link; null for any other event. */
export async function fetchPublicEvent(eventId: string): Promise<Result<PublicEvent | null>> {
  const result = await call<PublicEventRow[] | null>(
    'public_event',
    { event: eventId },
    'Could not load this event.',
  );
  if (!result.ok) return result;
  const row = result.value?.[0];
  if (!row) return { ok: true, value: null };
  return {
    ok: true,
    value: {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      descriptionHtml: row.description_html ?? '',
      startTime: row.start_time,
      endTime: row.end_time,
      allDay: Boolean(row.all_day),
      timezone: row.timezone,
      location: row.location ?? '',
      city: row.city,
      state: row.state,
      format: row.event_format,
      url: row.url,
      registrationUrl: row.registration_url,
      photoPath: row.photo_path,
      photoAlt: row.photo_alt,
      organization:
        row.organization_id && row.organization_name
          ? {
              id: row.organization_id,
              name: row.organization_name,
              shortCode: row.organization_short_code ?? '',
              logoPath: row.organization_logo_path,
            }
          : null,
    },
  };
}

/* ------------------------------------------------------------ registering */

export interface Registration {
  eventId: string;
  status: RsvpStatus;
  name: string;
  email: string;
  phone: string;
  /** The hosting organization's name, for the welcome page. */
  organizer?: string;
}

/** Keeps a registration for the event's organizers, account or not. */
export function registerForEvent(registration: Registration): Promise<Result<null>> {
  return call<null>(
    'register_for_event',
    {
      event: registration.eventId,
      name: registration.name.trim(),
      email: registration.email.trim(),
      phone: registration.phone.trim() || null,
      status: registration.status,
    },
    'The registration was not saved.',
  );
}

/**
 * Registrations made with the signed-in member's confirmed address become
 * their RSVPs. Resolves to those events, newest first.
 */
export async function claimEventRegistrations(): Promise<string[]> {
  const result = await call<string[] | null>(
    'claim_event_registrations',
    {},
    'Could not finish the registration.',
  );
  return result.ok ? (result.value ?? []) : [];
}

/*
 * The registration just made, kept on this device so the welcome page can
 * say so, the join form can start from it, and the app can open the event
 * once its owner is in. The club keeps its own copy (event_registrations);
 * this one is only the device's way back to the event.
 */

const PENDING_KEY = 'sciclub.eventRegistration';

export function keepPendingRegistration(registration: Registration): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(registration));
  } catch {
    // Private browsing: the registration is kept by the club all the same.
  }
}

export function pendingRegistration(): Registration | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Registration>;
    if (typeof value.eventId !== 'string' || typeof value.email !== 'string') return null;
    return {
      eventId: value.eventId,
      status: value.status === 'interested' ? 'interested' : 'going',
      name: typeof value.name === 'string' ? value.name : '',
      email: value.email,
      phone: typeof value.phone === 'string' ? value.phone : '',
      ...(typeof value.organizer === 'string' ? { organizer: value.organizer } : {}),
    };
  } catch {
    return null;
  }
}

export function forgetPendingRegistration(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing kept.
  }
}

/* ------------------------------------------------------------- guest list */

export type GuestState = 'member' | 'joining' | 'unconfirmed';

export interface Guest {
  name: string;
  email: string | null;
  phone: string | null;
  status: RsvpStatus;
  state: GuestState;
  respondedAt: string;
}

interface GuestRow {
  name: string | null;
  email: string | null;
  phone: string | null;
  status: RsvpStatus;
  state: GuestState;
  responded_at: string;
}

/** The event's guest list, for its organizers and administrators. */
export async function fetchGuestList(eventId: string): Promise<Result<Guest[]>> {
  const result = await call<GuestRow[] | null>(
    'event_guest_list',
    { event: eventId },
    'Could not load the guest list.',
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: (result.value ?? []).map((row) => ({
      name: row.name ?? 'Somebody',
      email: row.email,
      phone: row.phone,
      status: row.status,
      state: row.state,
      respondedAt: row.responded_at,
    })),
  };
}

/** The list as a spreadsheet's CSV: what an organizer takes elsewhere. */
export function guestListCsv(guests: Guest[]): string {
  const cell = (value: string | null) => {
    // Typed by anybody on a public page: a leading = + - @ would be a formula
    // in the organizer's spreadsheet, so it is kept as text.
    const raw = value ?? '';
    const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = guests.map((g) =>
    [g.name, g.email, g.phone, g.status, GUEST_STATE_LABEL[g.state], g.respondedAt]
      .map(cell)
      .join(','),
  );
  return ['Name,Email,Phone,Response,In the club,Responded', ...rows].join('\r\n');
}

export const GUEST_STATE_LABEL: Record<GuestState, string> = {
  member: 'Member',
  joining: 'Joining',
  unconfirmed: 'Not confirmed',
};

/** The address members share a public event by. */
export function publicEventUrl(eventId: string): string {
  return `https://thesciclub.com/e/${eventId}`;
}
