import { Download, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { OpenInAppButton } from '@/components/open-in-app';
import { useAccount } from '@/lib/account';
import { useAnnounce } from '@/lib/announce';
import {
  APP_STORE_PAGE,
  appCouldOpen,
  appNoteSeen,
  markAppNoteSeen,
  onIphoneHomeScreen,
} from '@/lib/app-handoff';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { useDialogFocus } from '@/lib/dialog-focus';
import {
  currentAppleDevice,
  currentInstallPlatform,
  INSTALL_STEPS,
  type InstallPlatform,
  isHandheld,
  laterVisit,
  nudgeSnoozed,
  snoozedFor,
  snoozeNudge,
  useInstallPrompt,
} from '@/lib/install';
import { loadNotifications } from '@/lib/notifications';
import { SENT_EVENT } from '@/lib/push/notifications';
import { isNative } from '@/lib/standalone';
import { getSupabase } from '@/lib/supabase';

/**
 * A nudge to put the club on the Home Screen, for somebody using it in a
 * browser (the owner, 2026-10-10).
 *
 * Why it matters here more than on most sites: on an iPhone the club can only
 * send notifications once it is on the Home Screen, and it opens full screen
 * and in one tap. Only inside the club, after joining
 * (the owner, 2026-10-30): iOS keeps the Home Screen app's sign-in separate from
 * Safari's, so added while signed in, the app opens signed in by the handoff
 * (src/lib/home-screen-handoff.ts), and added before, it starts at the doors.
 *
 * A card above the tab bar rather than a box over the screen: it pushes the
 * page up instead of covering it, and it is closed with one press, Not now,
 * which hides it for a week, then a month, then for good (the owner,
 * 2026-11-16; NUDGE_SNOOZES_DAYS). Me, then Settings, keeps the same steps for
 * whenever somebody wants them. Where the browser offers its own install
 * prompt (Chrome and Samsung Internet on Android), the button is Install and
 * shows that prompt; everywhere else it shows the steps for this browser.
 *
 * Only on mobile browsers (the owner, 2026-10-10), regardless of viewport
 * width: narrowing a desktop window must not show it, and a wide phone
 * must still offer installation. Not in the installed app, and not on the
 * member's first visit (laterVisit; the owner, 2026-11-16: asking then kept
 * people from the club), nor in the first moments after a screen opens. Never
 * in the store app, which is already installed.
 *
 * In an iPhone browser it also comes at the moments the app clearly helps,
 * first visit or not: somebody wrote to the member, they asked or answered
 * something, or they tapped Going on an event (useAppMoment).
 */
export function InstallNudge() {
  return isNative() ? null : <BrowserInstallNudge />;
}

function BrowserInstallNudge() {
  const { canPrompt, installed, prompt } = useInstallPrompt();
  const [platform] = useState<InstallPlatform>(() => currentInstallPlatform());
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => nudgeSnoozed());
  const [later] = useState(() => laterVisit());
  const iphoneBrowser = appCouldOpen();
  const moment = useAppMoment(iphoneBrowser && !dismissed);
  const [showing, setShowing] = useState(false);
  // The club on an iPhone's Home Screen: told of the app once (the owner,
  // 2026-11-15), and never again after Not now or Open in the app.
  const [homeScreenNote, setHomeScreenNote] = useState(
    () => onIphoneHomeScreen() && !appNoteSeen(),
  );
  const announce = useAnnounce();

  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (!isHandheld(platform)) return null;

  if (homeScreenNote) {
    return ready ? (
      <AppNudge
        fromHomeScreen
        onOpen={markAppNoteSeen}
        onNotNow={() => {
          markAppNoteSeen();
          setHomeScreenNote(false);
          announce('Hidden. Search for The SCI Club in the App Store any time.');
        }}
      />
    ) : null;
  }

  // An iPhone browser: the club's own app, not the website on the Home Screen
  // (the owner, 2026-11-15). Me, then Settings, still has the Home Screen steps.
  if (iphoneBrowser) {
    return dismissed || (moment === null && !(ready && later)) ? null : (
      <AppNudge
        moment={moment}
        onNotNow={() => {
          const days = snoozeNudge();
          setDismissed(true);
          announce(snoozedFor(days));
        }}
      />
    );
  }

  if (installed || dismissed || !ready || !later) {
    return showing ? (
      <InstallSheet
        platform={platform}
        onClose={() => {
          setShowing(false);
        }}
      />
    ) : null;
  }

  function notNow() {
    const days = snoozeNudge();
    setDismissed(true);
    announce(`${snoozedFor(days)} The steps are on Me, under Settings.`);
  }

  return (
    <>
      <aside
        aria-label={isHandheld(platform) ? 'Add the club to your Home Screen' : 'Install the club'}
        className="z-30 flex-none border-line border-t bg-paper px-4 py-3"
      >
        <div className="mx-auto flex w-full max-w-[480px] items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-[2.6em] w-[2.6em] flex-none place-items-center rounded-[12px] bg-tint text-emphasis"
          >
            <Download className="h-[1.3em] w-[1.3em]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold font-head text-[0.9375rem] text-ink leading-[1.3]">
              {isHandheld(platform)
                ? 'Put the club on your Home Screen'
                : 'Install the club on this computer'}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
              {platform.startsWith('ios')
                ? `Open it in one tap, and get notifications on your ${currentAppleDevice()}.`
                : 'Open it in one tap, full screen, like any other app.'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (canPrompt) {
                  void prompt().then((outcome) => {
                    if (outcome === 'unavailable') setShowing(true);
                  });
                } else {
                  setShowing(true);
                }
              }}
              className="mt-2.5 min-h-[44px] w-full rounded-[12px] bg-action px-4 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi"
            >
              {canPrompt ? 'Install' : 'Show me how'}
            </button>
          </div>
          <button
            type="button"
            onClick={notNow}
            aria-label="Not now"
            className="-mt-1 -mr-1 grid h-11 w-11 flex-none place-items-center rounded-full text-grey hover:bg-tint"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </aside>
      {showing ? (
        <InstallSheet
          platform={platform}
          onClose={() => {
            setShowing(false);
          }}
        />
      ) : null}
    </>
  );
}

/** A moment the app clearly helps with (the owner, 2026-11-16). */
type AppMoment = { kind: 'wrote'; name: string | null } | { kind: 'sent' } | { kind: 'going' };

// What somebody writing to the member is notified as.
const WROTE = new Set(['direct', 'group', 'reply', 'reply_participant', 'mention']);

const ignore = () => undefined;

/**
 * Somebody wrote to the member while the club was open ("Dana wrote to you.
 * Get the app so you know next time."); they asked a question, answered one
 * or sent a message ("Know when someone replies", the owner,
 * 2026-11-16); or they tapped Going on an event ("Get a reminder before it
 * starts"). Heard from their notifications as they arrive, and from
 * SENT_EVENT, as AskAfterSending does in the app. Only while `watching`: an
 * iPhone browser, with the card not hidden. The first moment stays.
 */
function useAppMoment(watching: boolean): AppMoment | null {
  const account = useAccount();
  const memberId = watching && account.status === 'member' ? account.userId : null;
  const [moment, setMoment] = useState<AppMoment | null>(null);
  const named = useRef(false);

  useEffect(() => {
    if (!watching) return;
    function sent(event: Event) {
      const kind = (event as CustomEvent<unknown>).detail === 'going' ? 'going' : 'sent';
      setMoment((now) => now ?? { kind });
    }
    window.addEventListener(SENT_EVENT, sent);
    return () => {
      window.removeEventListener(SENT_EVENT, sent);
    };
  }, [watching]);

  useRealtimeRows({
    table: 'notifications',
    filter: memberId ? `member_id=eq.${memberId}` : undefined,
    enabled: memberId !== null,
    onChange: ignore,
    onReturn: ignore,
    onRow: (row, event) => {
      if (event !== 'INSERT' || !WROTE.has(String(row.kind)) || named.current) return;
      named.current = true;
      // The row holds only ids; the list reads the name.
      void loadNotifications().then((result) => {
        const found = result.ok ? result.notifications.find((n) => n.id === row.id) : undefined;
        const name = found?.actorName?.match(/\S+/)?.[0] ?? null;
        setMoment((now) => now ?? { kind: 'wrote', name });
      });
    },
  });

  return moment;
}

/**
 * Whether the club knows this member has the iPhone app (the owner,
 * 2026-11-15: "If ... the app is not installed it should say install and not
 * open"; 20261115130000). A page cannot see the phone's apps, and Safari
 * answers a thesciclub:// link to a missing app with an error. Null while
 * asked; no on any failure, as Install is never wrong.
 */
function useHasTheApp(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void getSupabase()
      .rpc('i_have_the_app')
      .then(
        ({ data }) => {
          if (live) setHas(data === true);
        },
        () => {
          if (live) setHas(false);
        },
      );
    return () => {
      live = false;
    };
  }, []);
  return has;
}

/**
 * The nudge in an iPhone browser, in place of the Home Screen one, and so only
 * inside the club, after signing in (the owner, 2026-11-15: sign in in the
 * browser, where autofill helps, then get the app). Install the app, unless
 * the club knows the member has it (useHasTheApp); then Open in the app,
 * which carries the browser's sign-in over, so no password again, and opens
 * on this page. A fresh install signs in from Welcome back's Continue sign in
 * using your browser, which the hint names.
 */
function AppNudge({
  onNotNow,
  onOpen,
  fromHomeScreen = false,
  moment = null,
}: {
  onNotNow: () => void;
  onOpen?: () => void;
  /** Said as what just happened, in place of the usual words. */
  moment?: AppMoment | null;
  /** In the Home Screen copy, which is told once, as news. */
  fromHomeScreen?: boolean;
}) {
  const { pathname, search } = useLocation();
  const hasApp = useHasTheApp();
  const path = `${pathname}${search}`;
  const primary =
    'mt-2.5 flex min-h-[44px] w-full items-center justify-center rounded-[12px] bg-action px-4 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi';
  const secondary =
    'mt-1 flex min-h-[44px] items-center text-left text-[0.8125rem] text-emphasis underline underline-offset-2';
  // Asked first, so Open in the app is never offered to a phone without it.
  if (hasApp === null) return null;
  return (
    <aside
      aria-label="The club’s iPhone app"
      className="z-30 flex-none border-line border-t bg-paper px-4 py-3"
    >
      <div className="mx-auto flex w-full max-w-[480px] items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-[2.6em] w-[2.6em] flex-none place-items-center rounded-[12px] bg-tint text-emphasis"
        >
          <Download className="h-[1.3em] w-[1.3em]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold font-head text-[0.9375rem] text-ink leading-[1.3]">
            {moment?.kind === 'wrote'
              ? `${moment.name ?? 'Somebody'} wrote to you`
              : moment?.kind === 'sent'
                ? 'Know when someone replies'
                : moment?.kind === 'going'
                  ? 'Get a reminder before it starts'
                  : fromHomeScreen
                    ? 'The club now has an iPhone app'
                    : 'Get the club’s iPhone app'}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
            {moment?.kind === 'wrote'
              ? hasApp
                ? 'The app tells you next time, with a notification.'
                : 'Get the app so you know next time.'
              : moment?.kind === 'sent'
                ? hasApp
                  ? 'The app notifies you, with its notifications on.'
                  : 'Get the club’s iPhone app, and it notifies you.'
                : moment?.kind === 'going'
                  ? 'The club’s iPhone app can send you one.'
                  : fromHomeScreen
                    ? 'The same club, from the App Store, with notifications.'
                    : 'The club in one tap, with notifications.'}
          </p>
          {hasApp ? (
            <>
              <OpenInAppButton path={path} signedIn onOpen={onOpen} className={primary}>
                Open in the app, signed in
              </OpenInAppButton>
              <a href={APP_STORE_PAGE} className={secondary}>
                Not installed? Get it from the App Store
              </a>
            </>
          ) : (
            <>
              <a href={APP_STORE_PAGE} className={primary}>
                Install the app
              </a>
              <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.4]">
                Once it is installed, open it and tap Continue sign in using your browser: no
                password.
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onNotNow}
          aria-label="Not now"
          className="-mt-1 -mr-1 grid h-11 w-11 flex-none place-items-center rounded-full text-grey hover:bg-tint"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}

/**
 * Able Bodied's own clip of adding the club to an iPhone's Home Screen in
 * Chrome (the owner, 2026-10-28), shown with Chrome's and Safari's steps:
 * Safari's are much the same (the owner). Served from the site, not YouTube: no
 * player to load first and nothing sent to Google. HEVC, which every iPhone
 * browser plays, at 2.8 MB, fetched only once Watch how is tapped; not in the
 * service worker's precache (vite.config.ts), which takes no video. Muted so
 * it starts at once; its controls unmute it.
 */
export const HOW_TO_VIDEO = '/video/how-to-add-to-home-screen.mp4';
export const HOW_TO_POSTER = '/video/how-to-add-to-home-screen.jpg';

/**
 * Plays by itself, muted and on repeat, as soon as the steps open (the owner,
 * 2026-10-28), with its controls kept so it can be paused. Not by itself for
 * somebody who has asked their phone to reduce motion: the still and a play
 * button instead.
 */
function HowToVideo() {
  const [still] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  return (
    <div className="mx-auto mt-3 aspect-[882/1920] max-h-[60dvh] w-auto overflow-hidden rounded-[14px] bg-black">
      <video
        src={HOW_TO_VIDEO}
        poster={HOW_TO_POSTER}
        aria-label="Video: adding the club to your Home Screen on an iPhone"
        className="block h-full w-full"
        autoPlay={!still}
        loop
        muted
        playsInline
        controls
        preload={still ? 'none' : 'auto'}
      />
    </div>
  );
}

/** The steps for this browser, as a sheet over the screen. */
export function InstallSheet({
  platform,
  onClose,
}: {
  platform: InstallPlatform;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onClose);
  const { intro, steps } = INSTALL_STEPS[platform];
  const ios = platform.startsWith('ios');

  return (
    <>
      <button
        type="button"
        aria-label="Close the steps"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-[81] max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-paper px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-14px_40px_rgba(10,20,35,.3)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[520px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.01em] outline-none"
        >
          {isHandheld(platform) ? 'Add the club to your Home Screen' : 'Install the club'}
        </h2>
        {intro ? <p className="mt-1.5 text-[0.875rem] text-ink2 leading-[1.5]">{intro}</p> : null}
        {platform === 'ios-chrome' || platform === 'ios-safari' ? <HowToVideo /> : null}
        <ol className="mt-4 space-y-3.5">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid h-[1.9em] w-[1.9em] flex-none place-items-center rounded-full bg-action font-bold text-[0.875rem] text-white"
              >
                {index + 1}
              </span>
              <span className="pt-[0.15em] text-[0.9375rem] text-ink leading-[1.5]">{step}</span>
            </li>
          ))}
        </ol>
        {ios ? (
          <p className="mt-4 text-[0.8125rem] text-grey leading-[1.5]">
            The Home Screen app should open already signed in. If it doesn't, sign in inside it. On
            an {currentAppleDevice()}, notifications only work from there.
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-[48px] w-full rounded-[13px] border-[1.6px] border-line bg-paper font-bold font-head text-[0.9375rem] text-ink hover:bg-tint"
        >
          Done
        </button>
      </div>
    </>
  );
}

/**
 * The same steps, always reachable from Me, then Settings: for somebody who
 * closed the nudge, or who is on a computer. Nothing in the installed app or
 * the store app.
 */
export function InstallSettings() {
  return isNative() ? null : <BrowserInstallSettings />;
}

function BrowserInstallSettings() {
  const { canPrompt, installed, prompt } = useInstallPrompt();
  const [platform] = useState<InstallPlatform>(() => currentInstallPlatform());
  const [showing, setShowing] = useState(false);
  if (installed) return null;
  return (
    <section aria-labelledby="install-settings-heading" className="mt-6">
      <h2
        id="install-settings-heading"
        className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Home Screen
      </h2>
      <div className="rounded-[17px] border border-line bg-paper p-3.5">
        <p className="text-[0.875rem] text-ink2 leading-[1.45]">
          {isHandheld(platform)
            ? 'Put the club on your Home Screen to open it in one tap, full screen, with notifications.'
            : 'Install the club as an app on this computer, in its own window.'}
        </p>
        <button
          type="button"
          onClick={() => {
            if (canPrompt)
              void prompt().then((outcome) => {
                if (outcome === 'unavailable') setShowing(true);
              });
            else setShowing(true);
          }}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[11px] border-[1.6px] border-emphasis font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint"
        >
          {canPrompt ? 'Install' : 'Show me how'}
        </button>
      </div>
      {showing ? (
        <InstallSheet
          platform={platform}
          onClose={() => {
            setShowing(false);
          }}
        />
      ) : null}
    </section>
  );
}
