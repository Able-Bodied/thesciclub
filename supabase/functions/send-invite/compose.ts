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
}

export const SITE_URL = 'https://thesciclub.com';

export function inviteLink(token: string, siteUrl: string = SITE_URL): string {
  return `${siteUrl.replace(/\/+$/, '')}/join?invite=${encodeURIComponent(token)}`;
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

  const subject = `${who} invited you to The SCI Club`;
  const senderName = d.inviter.trim() ? `${headerSafe(who)} via The SCI Club` : 'The SCI Club';
  const invitedLine = organization
    ? `${who} invited you to join The SCI Club, with ${organization}.`
    : `${who} invited you to join The SCI Club.`;
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
    ...(organization ? [`You will join ${organization} in the club as well.`, ''] : []),
    once,
  ].join('\n');

  const p = 'margin:0 0 20px;';
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.5;">
    <div style="max-width:560px;">
    <p style="${p}font-size:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#7a5c12;">The SCI Club</p>
${name ? `    <p style="${p}">Hi ${escapeHtml(name)},</p>\n` : ''}    <p style="${p}"><strong>${escapeHtml(who)}</strong> invited you to join The SCI Club${organization ? `, with <strong>${escapeHtml(organization)}</strong>` : ''}.</p>
${
  message
    ? `    <p style="margin:0 0 8px;font-size:16px;color:#333333;">${escapeHtml(who)} wrote:</p>
    <blockquote style="margin:0 0 24px;padding:12px 16px;border-left:4px solid #b8892b;background:#f7f3ea;font-size:20px;">${escapeHtml(message).replace(/\r?\n/g, '<br>')}</blockquote>\n`
    : ''
}    <p style="margin:0 0 8px;">The SCI Club is a private, members-only community. Members:</p>
    <ul style="margin:0 0 28px;padding-left:28px;">
      <li>meet peers and mentors</li>
      <li>ask questions and share what they know</li>
      <li>find events and get-togethers near them</li>
    </ul>
    <p style="margin:0 0 28px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 28px;background:#111111;color:#ffffff;font-size:20px;font-weight:bold;text-decoration:none;border-radius:8px;">Accept the invite</a>
    </p>
${organization ? `    <p style="${p}">You will join ${escapeHtml(organization)} in the club as well.</p>\n` : ''}    <p style="margin:0 0 8px;">Or open this link:</p>
    <p style="margin:0 0 28px;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#0b3d91;">${escapeHtml(link)}</a></p>
    <p style="margin:0;font-size:18px;color:#333333;">${once}</p>
    </div>
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
