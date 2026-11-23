/**
 * What an email said, safe to show on the admin site (the owner, 2026-11-23): a sign-in code
 * or one-time link still works for a while after it is sent, so neither is shown.
 */

/** Query parameters that carry a one-time secret: sign-in, confirmation, invite, signed photo. */
const SECRET_PARAMS = /([?&](?:amp;)?(?:token|token_hash|invite|code|t)=)[^&"'\s<>]+/gi;

/** A 6–8 digit code standing alone: not part of a colour (#111111), a word or a longer number. */
const CODE = /(^|[^#\w.,-])\d{6,8}(?![\w.,-]*\d)(?!\w)/g;

export function hideSecrets(value: string): string {
  return value.replace(SECRET_PARAMS, '$1hidden').replace(CODE, '$1••••••');
}

/**
 * The email as a page for a sandboxed frame: nothing fetched from outside, so an invite's
 * "opened" pixel is not set off by the owner reading it, and no script runs.
 */
export function framedHtml(html: string): string {
  const policy =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">';
  const hidden = hideSecrets(html);
  return /<head[^>]*>/i.test(hidden)
    ? hidden.replace(/<head[^>]*>/i, (head) => `${head}${policy}`)
    : `${policy}${hidden}`;
}
