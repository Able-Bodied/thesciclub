/**
 * The email for an invite to an event (20261114070000; the owner, 2026-11-14:
 * "a nice e-mail that looks like you are on the invite page for the event").
 *
 * The event as its page shows it: the picture, the day, the title, the time
 * and place, then Going, Maybe and Can't go, then what it is about and who
 * hosts it. Each answer is a link that opens the event's page with the
 * answer saved: no mail app saves an answer by itself everywhere.
 *
 * Two kinds of reader. A guest (somebody outside the club, from a list): the
 * links carry their invite, and it ends with what the club is and a way to
 * join. A member (invited by name to an invite-only event): the links open
 * the event in the club.
 *
 * Tables, filled cells for buttons and nothing under 18px, as the invite email
 * after its review (send-invite/compose.ts, 2026-11-14): Outlook ignores
 * max-width, padding on a link and rounded corners, and Gmail can drop the
 * body's own padding.
 */

export interface EventCard {
  title: string;
  start: string | null;
  end: string | null;
  timezone: string | null;
  allDay: boolean;
  /** "Venue, City", "Online", or null. */
  place: string | null;
  /** Plain text; shortened here. */
  description: string | null;
  /** A link that works for an hour or weeks, signed; null for none. */
  imageUrl: string | null;
  imageAlt: string | null;
  /** Who hosts it. */
  organization: string | null;
}

export interface RsvpLinks {
  going: string;
  interested: string;
  no: string;
  /** The event's page, with nothing answered. */
  page: string;
  /** A guest's way into the club with their invite. */
  join?: string;
}

export interface EventInviteInput {
  /** "Maya", or the organization for an organization's invite; empty when nobody is named. */
  inviter: string;
  /** What to call them: "Hi Ana,". */
  name?: string | null;
  /** The inviter's own words. */
  message?: string | null;
  event: EventCard;
  links: RsvpLinks;
  reader: 'guest' | 'member';
  /** The organization a guest joins with, when it is not the inviter. */
  joinsWith?: string | null;
  /** The open picture (invite-opened), when there is one. */
  pixel?: string | null;
}

export interface EventInviteEmail {
  subject: string;
  text: string;
  html: string;
  /** "Maya via The SCI Club". */
  senderName: string;
}

const ZONE = 'America/Los_Angeles';
const DESCRIPTION_MAX = 600;

// The club's colors (src/index.css, light): ink, ink2, gold, on-gold, gold-dp, plate, line.
const INK = '#0e2646';
const INK2 = '#4a5b73';
const GOLD = '#d4a83a';
const ON_GOLD = '#102a4c';
const GOLD_DP = '#8a6512';
const PLATE = '#102a4c';
const LINE = '#cbd3de';
const FONT = 'Arial,Helvetica,sans-serif';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function filled(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** One line, nothing a mail header could be split or spoofed with. */
function headerSafe(value: string): string {
  return value
    .replace(/[\r\n<>"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function format(at: Date, zone: string, options: Intl.DateTimeFormatOptions): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }).format(at);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: ZONE, ...options }).format(at);
    } catch {
      return null;
    }
  }
}

function dateOf(value: string | null): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** "Saturday, November 22", in the event's own time zone. */
export function dayLine(start: string | null, timezone: string | null): string | null {
  const at = dateOf(start);
  if (!at) return null;
  return format(at, timezone ?? ZONE, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "2:00 PM – 4:00 PM PST", "2:00 PM PST", or "All day". */
export function timeLine(
  start: string | null,
  end: string | null,
  timezone: string | null,
  allDay: boolean,
): string | null {
  if (allDay) return 'All day';
  const from = dateOf(start);
  if (!from) return null;
  const zone = timezone ?? ZONE;
  const clock: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const to = dateOf(end);
  const sameDay =
    to &&
    to > from &&
    format(from, zone, { year: 'numeric', month: 'numeric', day: 'numeric' }) ===
      format(to, zone, { year: 'numeric', month: 'numeric', day: 'numeric' });
  if (to && sameDay) {
    const a = format(from, zone, clock);
    const b = format(to, zone, { ...clock, timeZoneName: 'short' });
    return a && b ? `${a} – ${b}` : null;
  }
  return format(from, zone, { ...clock, timeZoneName: 'short' });
}

/** At most DESCRIPTION_MAX characters, cut at a word, with an ellipsis when cut. */
export function shortDescription(text: string | null): string | null {
  const clean = filled(text?.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
  if (!clean) return null;
  if (clean.length <= DESCRIPTION_MAX) return clean;
  const cut = clean.slice(0, DESCRIPTION_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > DESCRIPTION_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function button(href: string, label: string, tone: 'gold' | 'plain', width: string): string {
  const fill = tone === 'gold' ? GOLD : '#ffffff';
  const border = tone === 'gold' ? GOLD : PLATE;
  const color = tone === 'gold' ? ON_GOLD : PLATE;
  return `<td width="${width}" align="center" bgcolor="${fill}" style="background:${fill};border:2px solid ${border};border-radius:12px;padding:0;">
                            <a href="${escapeHtml(href)}" style="display:block;padding:14px 6px;color:${color};font-family:${FONT};font-size:18px;font-weight:bold;line-height:1.2;text-decoration:none;">${label}</a>
                          </td>`;
}

export function eventInviteEmail(input: EventInviteInput): EventInviteEmail {
  const who = input.inviter.trim();
  const named = who || 'Someone in the club';
  const name = filled(input.name);
  const message = filled(input.message);
  const event = input.event;
  const title = event.title.trim() || 'An event';
  const day = dayLine(event.start, event.timezone);
  const time = timeLine(event.start, event.end, event.timezone, event.allDay);
  const place = filled(event.place);
  const about = shortDescription(event.description);
  const host = filled(event.organization);
  const joinsWith = filled(input.joinsWith);
  const guest = input.reader === 'guest';
  const links = input.links;

  const subject = `${named} invited you to ${title}`;
  const senderName = who ? `${headerSafe(who)} via The SCI Club` : 'The SCI Club';
  const whenWhere = [time, place].filter(Boolean).join(' · ');
  const joinLine = `Join The SCI Club${joinsWith ? ` as part of ${joinsWith}` : ''} to see who else is going and talk with them before the day.`;
  const club =
    'The SCI Club is a private, members-only community where members meet peers and mentors, ask questions and find events near them.';
  const footer = guest
    ? 'This invite is just for you. If you were not expecting it, you can ignore this email.'
    : `You get this because ${named} invited you to this event in The SCI Club.`;

  const text = [
    ...(name ? [`Hi ${name},`, ''] : []),
    `${named} invited you to ${title}.`,
    ...(message ? ['', `${named} wrote:`, ...message.split(/\r?\n/).map((l) => `> ${l}`)] : []),
    '',
    title,
    ...(day ? [day] : []),
    ...(whenWhere ? [whenWhere] : []),
    '',
    'Are you coming? One tap saves your answer:',
    `Going: ${links.going}`,
    `Maybe: ${links.interested}`,
    `Can't go: ${links.no}`,
    ...(about ? ['', about] : []),
    ...(host ? ['', `Hosted by ${host}`] : []),
    '',
    `See the event: ${links.page}`,
    ...(guest && links.join ? ['', joinLine, club, `Join: ${links.join}`] : []),
    '',
    footer,
  ].join('\n');

  const p = `margin:0 0 20px;font-family:${FONT};font-size:20px;line-height:1.5;color:${INK};`;
  const greeting = `${name ? `<p style="${p}">Hi ${escapeHtml(name)},</p>\n                ` : ''}<p style="${p}"><strong>${escapeHtml(named)}</strong> invited you to this event.</p>`;
  const quote = message
    ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-left:4px solid ${GOLD};background:#f7f3ea;padding:12px 16px;font-family:${FONT};font-size:20px;line-height:1.5;color:${INK};">${escapeHtml(message).replace(/\r?\n/g, '<br>')}</td>
                  </tr>
                </table>`
    : '';
  const picture = event.imageUrl
    ? `
                    <tr>
                      <td style="padding:0;">
                        <img src="${escapeHtml(event.imageUrl)}" width="560" alt="${escapeHtml(filled(event.imageAlt) ?? '')}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:15px 15px 0 0;" />
                      </td>
                    </tr>`
    : '';
  const aboutHtml = about
    ? `
                        <p style="margin:24px 0 0;font-family:${FONT};font-size:18px;line-height:1.55;color:${INK};">${escapeHtml(about).replace(/\n/g, '<br>')}</p>`
    : '';
  const hostHtml = host
    ? `
                        <p style="margin:20px 0 0;font-family:${FONT};font-size:18px;line-height:1.4;color:${INK2};">Hosted by <strong style="color:${INK};">${escapeHtml(host)}</strong></p>`
    : '';
  const joinHtml =
    guest && links.join
      ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                  <tr>
                    <td bgcolor="${PLATE}" style="background:${PLATE};border-radius:16px;padding:20px;font-family:${FONT};">
                      <p style="margin:0 0 8px;font-size:20px;font-weight:bold;line-height:1.4;color:#ffffff;">${escapeHtml(joinLine)}</p>
                      <p style="margin:0 0 16px;font-size:18px;line-height:1.5;color:#d9e2ee;">${escapeHtml(club)}</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td bgcolor="${GOLD}" style="background:${GOLD};border-radius:12px;">
                            <a href="${escapeHtml(links.join)}" style="display:block;padding:14px 24px;color:${ON_GOLD};font-family:${FONT};font-size:18px;font-weight:bold;text-decoration:none;">Join the club</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>`
      : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f9;color:${INK};font-family:${FONT};font-size:20px;line-height:1.5;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml([day, whenWhere].filter(Boolean).join(', ') || title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f9;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="font-family:${FONT};text-align:left;">
                <p style="margin:0 0 20px;font-size:18px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD_DP};">The SCI Club</p>
                ${greeting}${quote}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;margin:0 0 28px;">${picture}
                  <tr>
                    <td style="padding:20px;">
                        <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:${GOLD_DP};">${escapeHtml(day ?? 'Date to be set')}</p>
                        <p style="margin:8px 0 0;font-family:${FONT};font-size:28px;font-weight:bold;line-height:1.25;color:${INK};"><a href="${escapeHtml(links.page)}" style="color:${INK};text-decoration:none;">${escapeHtml(title)}</a></p>
${whenWhere ? `                        <p style="margin:8px 0 0;font-family:${FONT};font-size:18px;line-height:1.45;color:${INK2};">${escapeHtml(whenWhere)}</p>\n` : ''}                        <p style="margin:20px 0 10px;font-family:${FONT};font-size:18px;font-weight:bold;color:${INK};">Are you coming?</p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                          ${button(links.going, 'Going', 'gold', '34%')}
                          <td width="2%" style="font-size:0;line-height:0;">&nbsp;</td>
                          ${button(links.interested, 'Maybe', 'plain', '30%')}
                          <td width="2%" style="font-size:0;line-height:0;">&nbsp;</td>
                          ${button(links.no, 'Can&#39;t go', 'plain', '32%')}
                          </tr>
                        </table>
                        <p style="margin:10px 0 0;font-family:${FONT};font-size:18px;line-height:1.45;color:${INK2};">One tap saves your answer. You can change it later.</p>${aboutHtml}${hostHtml}
                        <p style="margin:20px 0 0;font-family:${FONT};font-size:18px;"><a href="${escapeHtml(links.page)}" style="color:#0b3d91;font-weight:bold;">See the event</a></p>
                    </td>
                  </tr>
                </table>${joinHtml}
                <p style="margin:0;font-family:${FONT};font-size:18px;line-height:1.5;color:${INK2};">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>${input.pixel ? `\n    <img src="${escapeHtml(input.pixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />` : ''}
  </body>
</html>
`;
  return { subject, text, html, senderName };
}

/** The event's page with an answer to save: ?rsvp=going|interested|no, after what is there. */
export function withRsvp(page: string, answer: 'going' | 'interested' | 'no'): string {
  return `${page}${page.includes('?') ? '&' : '?'}rsvp=${answer}`;
}

/** A signed link to an event's picture in the photos bucket, for weeks; null when it cannot. */
export async function signedPhotoUrl(
  supabaseUrl: string,
  headers: Record<string, string>,
  path: string | null,
  seconds = 60 * 86_400,
): Promise<string | null> {
  if (!path) return null;
  try {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/photos/${path.split('/').map(encodeURIComponent).join('/')}`,
      { method: 'POST', headers, body: JSON.stringify({ expiresIn: seconds }) },
    );
    if (!response.ok) return null;
    const signed = ((await response.json()) as { signedURL?: string }).signedURL;
    return signed ? `${supabaseUrl}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}` : null;
  } catch {
    return null;
  }
}

/** `"Maya via The SCI Club" <invites@thesciclub.com>`, from the configured sender. */
export function fromWithName(configured: string, senderName: string): string {
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured.trim();
  return `"${headerSafe(senderName) || 'The SCI Club'}" <${address}>`;
}
