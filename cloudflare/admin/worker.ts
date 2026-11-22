/**
 * admin.thesciclub.com's Worker (the owner, 2026-11-22). The admin site is static assets; this
 * runs only for /app-status: whether the members' app is answering, read from its /version.json
 * here because the app does not let other sites read it from a browser. APP_ORIGIN is set per
 * site in wrangler.toml.
 */
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  APP_ORIGIN: string;
}

export interface AppStatus {
  up: boolean;
  status: number | null;
  ms: number | null;
  built: string | null;
}

export async function appStatus(origin: string, fetcher: typeof fetch = fetch): Promise<AppStatus> {
  const started = Date.now();
  try {
    const response = await fetcher(`${origin}/version.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const ms = Date.now() - started;
    if (!response.ok) return { up: false, status: response.status, ms, built: null };
    const body = (await response.json().catch(() => null)) as { built?: unknown } | null;
    return {
      up: true,
      status: response.status,
      ms,
      built: typeof body?.built === 'string' ? body.built : null,
    };
  } catch {
    return { up: false, status: null, ms: null, built: null };
  }
}

const REPO = 'Alfredx48/TheSciClub';
const RELEASES_SHOWN = 12;

export interface Release {
  tag: string;
  /** The build minute, as page speed's samples name the release: 2026-11-22T22:08. */
  built: string;
  sha: string;
  commits: { sha: string; title: string; author: string }[];
}

/** release-2026-11-22T2208 → 2026-11-22T22:08. */
export function builtOf(tag: string): string | null {
  const m = /^release-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})$/.exec(tag);
  return m ? `${m[1]}T${m[2]}:${m[3]}` : null;
}

/** The commit's first line, without the owner's attribution in brackets at its end. */
export function titleOf(message: string): string {
  const first = message.split('\n')[0] ?? '';
  return first.length > 220 ? `${first.slice(0, 219)}…` : first;
}

/**
 * The latest releases and what each brought, from the repository's release tags (site.yml tags
 * each live deploy). The repository is public, so this is what anybody could read there.
 */
export async function releases(fetcher: typeof fetch = fetch): Promise<Release[]> {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sciclub-admin',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const refs = (await (
    await fetcher(`https://api.github.com/repos/${REPO}/git/matching-refs/tags/release-`, {
      headers,
    })
  ).json()) as { ref: string; object: { sha: string } }[];
  if (!Array.isArray(refs)) throw new Error('GitHub did not answer with tags.');
  const tags = refs
    .map((r) => ({ tag: r.ref.replace('refs/tags/', ''), sha: r.object.sha }))
    .filter((t) => builtOf(t.tag) !== null)
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .slice(-(RELEASES_SHOWN + 1));
  const shown = tags.slice(1).reverse();
  return Promise.all(
    shown.map(async (t) => {
      const index = tags.findIndex((x) => x.tag === t.tag);
      const before = tags[index - 1];
      let commits: Release['commits'] = [];
      if (before) {
        const compare = (await (
          await fetcher(`https://api.github.com/repos/${REPO}/compare/${before.sha}...${t.sha}`, {
            headers,
          })
        ).json()) as {
          commits?: { sha: string; commit: { message: string; author?: { name?: string } } }[];
        };
        commits = (compare.commits ?? [])
          .map((c) => ({
            sha: c.sha.slice(0, 8),
            title: titleOf(c.commit.message),
            author: c.commit.author?.name ?? '',
          }))
          .reverse();
      }
      return { tag: t.tag, built: builtOf(t.tag) ?? '', sha: t.sha.slice(0, 8), commits };
    }),
  );
}

const RELEASES_CACHE_S = 600;

async function releasesAnswer(request: Request): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL('/releases', request.url).toString());
  const kept = await cache.match(key);
  if (kept) return kept;
  try {
    const answer = Response.json(await releases(), {
      headers: { 'Cache-Control': `public, max-age=${String(RELEASES_CACHE_S)}` },
    });
    await cache.put(key, answer.clone());
    return answer;
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/app-status') {
      return Response.json(await appStatus(env.APP_ORIGIN), {
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
      });
    }
    if (url.pathname === '/releases') return releasesAnswer(request);
    return env.ASSETS.fetch(request);
  },
};
