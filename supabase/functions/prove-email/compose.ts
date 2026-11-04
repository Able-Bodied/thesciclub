/** What the code email says, kept apart from sending so it can be tested. */

export interface ProofEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * A code and no link (20261104110000): the address's owner, if it was not
 * them who joined, must not be able to confirm the account with one tap.
 * `code` is digits, so it needs no escaping.
 */
export function confirmEmail(code: string): ProofEmail {
  const subject = 'Confirm your email for The SCI Club';
  const about = 'Somebody who joined The SCI Club with this address asked to confirm it.';
  const after = 'If that was you, type this code on Me, in the app. It works for 10 minutes.';
  const warning =
    'If it was not you, ignore this email, and do not give the code to anybody. Nobody from the club will ask you for it.';
  const text = [about, '', after, '', code, '', warning].join('\n');
  // Large, dark-on-white text, as the invite email has.
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.5;">
    <p style="margin:0 0 20px;">${about}</p>
    <p style="margin:0 0 20px;">${after}</p>
    <p style="margin:0 0 28px;font-size:32px;font-weight:bold;letter-spacing:6px;">${code}</p>
    <p style="margin:0;font-size:18px;color:#333333;">${warning}</p>
  </body>
</html>
`;
  return { subject, text, html };
}
