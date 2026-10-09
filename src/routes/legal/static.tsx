import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPage from '@/routes/legal/privacy';
import TermsPage from '@/routes/legal/terms';
import { NewTabLink, PHONE_BUTTON, PhoneStep, SIGN_IN_CONSENT } from '@/routes/onboarding/steps';
import { INITIAL_ONBOARDING_DATA } from '@/routes/onboarding/types';
import { WelcomeScreen } from '@/routes/onboarding/welcome';

/**
 * The Privacy Policy and the Terms of Service as finished HTML, written into
 * the build by `scripts/prerender-legal.mjs`.
 *
 * Every other path is the same empty shell until the app's JavaScript draws
 * it, and that was true of these two: a program that fetched /privacy without
 * running scripts got a page titled "The SCI Club" with nothing in it. Twilio's
 * pre-check of the text-message registration is such a program, and what it
 * looks for is a page titled "Privacy Policy" that carries the SMS sentence
 * and the brand's name (2026-10-01, "could not verify"). So these two paths
 * are served as HTML with their words already in them; the app then starts as
 * usual and draws the same page over it.
 *
 * And /join, the opt-in page the registration names. It was empty to the
 * same programs, so the reviewer found no Privacy Policy linked from it, and
 * the campaign was rejected a second time with the same error (2026-10-09,
 * Twilio support: "tied to the MESSAGE_FLOW section"). See `JoinPage`.
 *
 * Not the member pages. Those stay an empty shell on purpose, and keep the
 * noindex this removes from the two policies.
 */

/** Nothing to do: a press before the app has started is a press on nothing. */
function noop() {
  return undefined;
}

/**
 * /join as a program without JavaScript reads it: the welcome screen, which is
 * what the app paints first anyway, so somebody whose browser does run it sees
 * no jump; then, under <noscript>, the join door's phone step with its two
 * unticked boxes, its button and the sign-in door's line. These are the words
 * the message flow quotes, rendered from the same components and constants as
 * the app's, so they cannot drift apart.
 */
function JoinPage() {
  return (
    <>
      <WelcomeScreen onJoin={noop} onSignIn={noop} />
      <noscript>
        <main className="mx-auto w-full max-w-[480px] px-[22px] py-8">
          <h2 className="font-extrabold font-display text-[1.375rem] text-ink">Join the club</h2>
          <PhoneStep data={INITIAL_ONBOARDING_DATA} set={noop} mode="join" />
          <button
            type="button"
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-action font-bold font-head text-[0.9375rem] text-white"
          >
            {PHONE_BUTTON}
          </button>
          <h2 className="mt-8 font-extrabold font-display text-[1.375rem] text-ink">
            Already a member? Sign in
          </h2>
          <p className="mt-3 text-[0.84375rem] text-ink2 leading-[1.5]">
            {SIGN_IN_CONSENT} <NewTabLink href="/terms">Terms of Service</NewTabLink> and{' '}
            <NewTabLink href="/privacy">Privacy Policy</NewTabLink>.
          </p>
        </main>
      </noscript>
    </>
  );
}

export const STATIC_PAGES = [
  { file: 'privacy.html', title: 'Privacy Policy', Page: PrivacyPage, indexed: true },
  { file: 'terms.html', title: 'Terms of Service', Page: TermsPage, indexed: true },
  // Keeps its noindex: it is a door, not a document.
  { file: 'join.html', title: 'Join', Page: JoinPage, indexed: false },
] as const;

const ROBOTS = /\s*<meta name="robots" content="noindex, nofollow" \/>/;
const TITLE = '<title>The SCI Club</title>';
const ROOT = '<div id="root"></div>';

/**
 * The built index.html with one page written into it. Throws if the shell has
 * changed shape, so a build cannot quietly ship the empty page again.
 */
export function withPage(
  shell: string,
  title: string,
  Page: () => React.ReactElement,
  indexed = true,
): string {
  if (!ROBOTS.test(shell) || !shell.includes(TITLE) || !shell.includes(ROOT)) {
    throw new Error('index.html no longer has the robots meta, title and root this expects');
  }
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
  return shell
    .replace(ROBOTS, (meta) => (indexed ? '' : meta))
    .replace(TITLE, `<title>${title} · The SCI Club</title>`)
    .replace(ROOT, `<div id="root">${markup}</div>`);
}
