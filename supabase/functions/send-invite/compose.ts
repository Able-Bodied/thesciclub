/** What the invite email says, kept apart from sending so it can be tested. */

export interface InviteEmail {
  subject: string;
  text: string;
  html: string;
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

/**
 * `inviter` is the organization's name or the member's display name. The email
 * says who asked and names the club, and nothing else about why someone might
 * want it.
 */
export function inviteEmail(inviter: string, link: string): InviteEmail {
  const who = inviter.trim() || 'Someone in the club';
  const subject = `${who} invited you to The SCI Club`;
  const text = [
    `${who} invited you to join The SCI Club.`,
    '',
    'Open this link to accept:',
    link,
    '',
    'The link works once, on the newest email we sent you. If you did not expect this, you can ignore it.',
  ].join('\n');
  // Large, dark-on-white text, one button, and the link written out as well.
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.5;">
    <p style="margin:0 0 20px;font-size:20px;"><strong>${escapeHtml(who)}</strong> invited you to join The SCI Club.</p>
    <p style="margin:0 0 28px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 28px;background:#111111;color:#ffffff;font-size:20px;font-weight:bold;text-decoration:none;border-radius:8px;">Accept the invite</a>
    </p>
    <p style="margin:0 0 8px;">Or open this link:</p>
    <p style="margin:0 0 28px;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#0b3d91;">${escapeHtml(link)}</a></p>
    <p style="margin:0;font-size:18px;color:#333333;">The link works once, on the newest email we sent you. If you did not expect this, you can ignore it.</p>
  </body>
</html>
`;
  return { subject, text, html };
}
