/** What the invite email says, kept apart from sending so it can be tested. */

export interface InviteEmail {
  subject: string;
  text: string;
  html: string;
  /** Who it shows as from: "Maya via The SCI Club". */
  senderName: string;
}

export interface InviteDetails {
  /** The member's display name, or the organization's name for an organization's invite. */
  inviter: string;
  /** The organization they will join with, when it is not the inviter. */
  organization?: string | null;
  /** What to call them: "Hi Ana,". From a spreadsheet; often missing. */
  name?: string | null;
  /** The inviter's own words (20261114010000). */
  message?: string | null;
  /** The event the invite is for (20261114020000): its title and when, already worded. */
  event?: { title: string; when: string | null } | null;
}

export const SITE_URL = 'https://thesciclub.com';

export function inviteLink(token: string, siteUrl: string = SITE_URL): string {
  return `${siteUrl.replace(/\/+$/, '')}/join?invite=${encodeURIComponent(token)}`;
}

/** An event invite opens the event's own page, which takes it from there. */
export function eventInviteLink(
  eventId: string,
  token: string,
  siteUrl: string = SITE_URL,
): string {
  return `${siteUrl.replace(/\/+$/, '')}/e/${encodeURIComponent(eventId)}?invite=${encodeURIComponent(token)}`;
}

/** "Saturday, November 22, 2:00 PM PST", in the event's own time zone. */
export function eventWhen(
  start: string | null,
  timezone: string | null,
  allDay: boolean,
): string | null {
  if (!start) return null;
  const at = new Date(start);
  if (Number.isNaN(at.getTime())) return null;
  const zone = timezone ?? 'America/Los_Angeles';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: zone,
      ...(allDay ? {} : { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    }).format(at);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Trimmed, or null when there is nothing there. */
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

/**
 * Says who asked, with whom, in the inviter's own words when there are some,
 * and what the club is in general terms. Never anything about injury: an
 * email can be read over somebody's shoulder, and being invited must not say
 * anything about the person's health. The inviter's message is theirs to word.
 *
 * Large, dark-on-white text, one button, and the link written out as well.
 */
export function inviteEmail(details: InviteDetails | string, link: string): InviteEmail {
  const d: InviteDetails = typeof details === 'string' ? { inviter: details } : details;
  const who = d.inviter.trim() || 'Someone in the club';
  const organization = filled(d.organization);
  const name = filled(d.name);
  const message = filled(d.message);

  const event = d.event?.title.trim() ? d.event : null;
  const subject = event
    ? `${who} invited you to ${event.title.trim()}`
    : `${who} invited you to The SCI Club`;
  const senderName = d.inviter.trim() ? `${headerSafe(who)} via The SCI Club` : 'The SCI Club';
  const joining = organization ? `The SCI Club as part of ${organization}` : 'The SCI Club';
  const invitedLine = event
    ? `${who} invited you to ${event.title.trim()}${event.when ? `, ${event.when}` : ''}. To come, accept the invite and join ${joining}.`
    : `${who} invited you to join ${joining}.`;
  const what = [
    'The SCI Club is a private, members-only community. Members:',
    '- meet peers and mentors',
    '- ask questions and share what they know',
    '- find events and get-togethers near them',
  ];
  const once =
    'The link is just for you and works once. If you were not expecting this, you can ignore this email.';

  const text = [
    ...(name ? [`Hi ${name},`, ''] : []),
    invitedLine,
    ...(message ? ['', `${who} wrote:`, ...message.split(/\r?\n/).map((l) => `> ${l}`)] : []),
    '',
    ...what,
    '',
    'Open this link to accept:',
    link,
    '',
    once,
  ].join('\n');

  // Tables, not divs, and the button a filled cell: Outlook ignores max-width,
  // padding on a link and rounded corners, and Gmail can drop the body's own
  // padding (the Fable review, 2026-11-14). Nothing under 18px.
  const href = escapeHtml(link);
  const p = 'margin:0 0 20px;font-size:20px;line-height:1.5;color:#111111;';
  const preheader = event
    ? `${event.title.trim()}${event.when ? `, ${event.when}` : ''}`
    : `Join ${joining}.`;
  const invitedHtml = event
    ? `<strong>${escapeHtml(who)}</strong> invited you to <strong>${escapeHtml(event.title.trim())}</strong>${event.when ? `, ${escapeHtml(event.when)}` : ''}. To come, accept the invite and join The SCI Club${organization ? ` as part of <strong>${escapeHtml(organization)}</strong>` : ''}.`
    : `<strong>${escapeHtml(who)}</strong> invited you to join The SCI Club${organization ? ` as part of <strong>${escapeHtml(organization)}</strong>` : ''}.`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.5;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="left" style="padding:24px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 20px;font-size:18px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#7a5c12;">The SCI Club</p>
${name ? `                <p style="${p}">Hi ${escapeHtml(name)},</p>\n` : ''}                <p style="${p}">${invitedHtml}</p>
${
  message
    ? `                <p style="margin:0 0 8px;font-size:18px;line-height:1.5;color:#333333;">${escapeHtml(who)} wrote:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="border-left:4px solid #b8892b;background:#f7f3ea;padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.5;color:#111111;">${escapeHtml(message).replace(/\r?\n/g, '<br>')}</td>
                  </tr>
                </table>\n`
    : ''
}                <p style="margin:0 0 8px;font-size:20px;line-height:1.5;color:#111111;">The SCI Club is a private, members-only community. Members:</p>
                <ul style="margin:0 0 28px;padding-left:28px;font-size:20px;line-height:1.5;color:#111111;">
                  <li>meet peers and mentors</li>
                  <li>ask questions and share what they know</li>
                  <li>find events and get-togethers near them</li>
                </ul>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                  <tr>
                    <td bgcolor="#111111" style="background:#111111;border-radius:8px;padding:16px 28px;">
                      <a href="${href}" style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;text-decoration:none;">Accept the invite</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:20px;line-height:1.5;color:#111111;">Or open this link:</p>
                <p style="margin:0 0 28px;font-size:18px;line-height:1.5;word-break:break-all;overflow-wrap:anywhere;"><a href="${href}" style="color:#0b3d91;">${href}</a></p>
                <p style="margin:0;font-size:18px;line-height:1.5;color:#333333;">${once}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
  return { subject, text, html, senderName };
}

/** `"Maya via The SCI Club" <invites@thesciclub.com>`, from the configured sender. */
export function fromHeader(configured: string, senderName: string): string {
  const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured.trim();
  // Quoted, so a comma, colon or @ in a name stays part of the name.
  return `"${headerSafe(senderName) || 'The SCI Club'}" <${address}>`;
}
