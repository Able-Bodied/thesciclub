// The admin site's release list (admin/watch.tsx › Releases), written into its build as
// releases.json: the latest release tags and the commits each brought, from the repository's
// own history. Asked of GitHub's API from the Worker, it was refused (its limit for unsigned
// requests is shared by every site on Cloudflare's addresses). Run by site.yml's admin job,
// after a full fetch with tags. The repository is public, so this is what anybody can read there.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SHOWN = 12;
const out = process.argv[2] ?? 'dist-admin/releases.json';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const tags = git('tag', '--list', 'release-*', '--sort=refname')
  .split('\n')
  .filter((t) => /^release-\d{4}-\d{2}-\d{2}T\d{4}$/.test(t))
  .slice(-(SHOWN + 1));

const releases = tags
  .slice(1)
  .map((tag, i) => {
    const before = tags[i];
    const m = /^release-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})$/.exec(tag);
    const commits = git('log', '--format=%h%x09%an%x09%s', `${before}..${tag}`)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, author, ...title] = line.split('\t');
        const text = title.join('\t');
        return { sha, author, title: text.length > 220 ? `${text.slice(0, 219)}…` : text };
      });
    return {
      tag,
      built: `${m[1]}T${m[2]}:${m[3]}`,
      sha: git('rev-parse', '--short=8', `${tag}^{commit}`),
      commits,
    };
  })
  .reverse();

writeFileSync(out, JSON.stringify(releases));
console.log(`releases.json: ${releases.length} releases`);
