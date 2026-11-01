/**
 * What a text message shows for a link to an event (the owner, 2026-11-01): its
 * name, date and time, and its main picture.
 *
 * iMessage and the others read a page's tags without running its script, and
 * the app is one page, so every link looked the same. Only they are answered
 * here, by the name they give (iMessage's includes facebookexternalhit); a
 * member's browser goes straight on to the app and pays nothing. What is shown
 * is what the event's public page already shows anybody with the link
 * (public_event, 20261029110000).
 *
 * iMessage shows a title and the site, and not a description, so the date and
 * time are in the title.
 */

const SITE = 'https://thesciclub.com';
const FALLBACK_IMAGE = `${SITE}/favicon-512x512.png`;
/** A message keeps its picture long after it is sent, and the bucket is private. */
const IMAGE_FOR_SECONDS = 60 * 60 * 24 * 30;

const PREVIEWERS =
  /facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|linkedinbot|discordbot|telegrambot|skypeuripreview|applebot/i;
const EVENT_PATH =
  /^\/(?:e|events)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export interface PreviewEvent {
  id: string;
  title: string;
  start_time: string;
  all_day: boolean;
  timezone: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  photo_path: string | null;
}

export function eventIdIn(path: string): string | null {
  return EVENT_PATH.exec(path)?.[1] ?? null;
}

export function isPreviewer(agent: string | null): boolean {
  return PREVIEWERS.test(agent ?? '');
}

/** "Sat, Nov 7, 3:00 PM" in the event's own zone, or without a time all day. */
export function whenLine(event: PreviewEvent): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: event.timezone ?? 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(event.all_day ? {} : { hour: 'numeric', minute: '2-digit' }),
  }).format(new Date(event.start_time));
}

const escaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Organizations list or map, as a link to it says: /events?segment=orgs. */
export function isOrganizationsLink(url: URL): boolean {
  return /^\/events\/?$/.test(url.pathname) && url.searchParams.get('segment') === 'orgs';
}

/** A picture of the map, from public/share/: no reading, so nothing to go wrong. */
export function organizationMapPage(): string {
  const title = 'Map of SCI organizations on The SCI Club';
  const description =
    'Adaptive sports, peer support, rehab and more, near you and across the country.';
  const url = `${SITE}/events?segment=orgs&view=map`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="The SCI Club" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${escaped(url)}" />
<meta property="og:image" content="${SITE}/share/organization-map.jpg" />
<meta property="og:image:width" content="792" />
<meta property="og:image:height" content="749" />
<meta name="twitter:card" content="summary_large_image" />
</head>
<body><a href="${escaped(url)}">${title}</a></body>
</html>`;
}

export function previewPage(event: PreviewEvent, image: string | null): string {
  const when = whenLine(event);
  const place = [event.location, event.city, event.state].filter(Boolean).join(', ');
  const title = escaped(`${event.title} · ${when}`);
  const description = escaped(place ? `${when}. ${place}` : when);
  const url = `${SITE}/e/${event.id}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="The SCI Club" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${escaped(image ?? FALLBACK_IMAGE)}" />
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />
</head>
<body><a href="${url}">${title}</a></body>
</html>`;
}

declare const Netlify: { env: { get(name: string): string | undefined } };

async function readEvent(base: string, key: string, id: string): Promise<PreviewEvent | null> {
  const response = await fetch(`${base}/rest/v1/rpc/public_event`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: id }),
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as PreviewEvent[];
  return rows[0] ?? null;
}

async function signImage(base: string, key: string, path: string): Promise<string | null> {
  const response = await fetch(`${base}/storage/v1/object/sign/photos/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: IMAGE_FOR_SECONDS }),
  });
  if (!response.ok) return null;
  const { signedURL } = (await response.json()) as { signedURL?: string };
  return signedURL ? `${base}/storage/v1${signedURL}` : null;
}

export default async function eventPreview(
  request: Request,
  context: { next: () => Promise<Response> },
): Promise<Response> {
  const url = new URL(request.url);
  const previewing = isPreviewer(request.headers.get('user-agent'));
  if (previewing && isOrganizationsLink(url)) {
    return new Response(organizationMapPage(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
  const id = eventIdIn(url.pathname);
  const base = Netlify.env.get('VITE_SUPABASE_URL');
  const key = Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  if (!id || !base || !key || !previewing) {
    return await context.next();
  }
  try {
    const event = await readEvent(base, key, id);
    if (!event) return await context.next();
    const image = event.photo_path ? await signImage(base, key, event.photo_path) : null;
    return new Response(previewPage(event, image), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    // A plain preview is better than no page.
    return await context.next();
  }
}
