/**
 * The day-before reminder by email (20261028980000, the owner, 2026-10-28):
 * one email for each member going to each of tomorrow's events, as
 * event_reminder_emails returns them, sent through Resend in the daily run.
 * Plain words, a link to the event, and where to switch these off.
 */

export interface DueEmail {
  email: string;
  name: string | null;
  title: string;
  /** "Thursday, October 30 at 7:00 pm", or "…, all day". */
  starts: string;
  /** The venue and city, "Online", or null when the event names none. */
  place: string | null;
  url: string;
}

export interface ReminderEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const SETTINGS_URL = 'https://thesciclub.com/me';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function reminderEmail(due: DueEmail): ReminderEmail {
  const first = due.name?.trim().split(/\s+/)[0] ?? '';
  const hello = first ? `Hi ${first},` : 'Hi,';
  const where = due.place ? `\nWhere: ${due.place}` : '';
  const text = [
    hello,
    '',
    `A reminder that you're going to ${due.title} tomorrow.`,
    '',
    `When: ${due.starts}${where}`,
    '',
    `See the details: ${due.url}`,
    '',
    `You get this because you said you're going. To stop these emails, switch off "Email me the day before" on Me: ${SETTINGS_URL}`,
    '',
    'The SCI Club',
  ].join('\n');
  const html = `<p>${escapeHtml(hello)}</p>
<p>A reminder that you're going to <strong>${escapeHtml(due.title)}</strong> tomorrow.</p>
<p>When: ${escapeHtml(due.starts)}${due.place ? `<br>Where: ${escapeHtml(due.place)}` : ''}</p>
<p><a href="${escapeHtml(due.url)}">See the details</a></p>
<p style="color:#6b7280;font-size:13px">You get this because you said you're going. To stop these emails, switch off "Email me the day before" on <a href="${SETTINGS_URL}">Me</a>.</p>
<p>The SCI Club</p>`;
  return { to: due.email, subject: `Tomorrow: ${due.title}`, text, html };
}
