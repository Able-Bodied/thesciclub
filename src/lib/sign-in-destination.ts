/** Only app-relative destinations survive sign-in, including Google redirects. */
export function signInDestination(search: string): string {
  const next = new URLSearchParams(search).get('next');
  let hasControl = false;
  for (let index = 0; index < (next?.length ?? 0); index += 1) {
    if (next && next.charCodeAt(index) < 32) hasControl = true;
  }
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\') || hasControl)
    return '/home';
  const url = new URL(next, 'https://club.invalid');
  if (url.origin !== 'https://club.invalid' || /^\/join\/?$/.test(url.pathname)) return '/home';
  return `${url.pathname}${url.search}${url.hash}`;
}

export function signInDoor(destination: string): string {
  return `/join?${new URLSearchParams({ next: destination })}`;
}
