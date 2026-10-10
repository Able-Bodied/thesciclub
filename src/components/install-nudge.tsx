import { Download, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { useDialogFocus } from '@/lib/dialog-focus';
import {
  currentInstallPlatform,
  INSTALL_STEPS,
  type InstallPlatform,
  isHandheld,
  NUDGE_SNOOZE_DAYS,
  nudgeSnoozed,
  snoozeNudge,
  useInstallPrompt,
} from '@/lib/install';

/**
 * A nudge to put the club on the Home Screen, for somebody using it in a
 * phone's browser (the owner, 2026-10-10).
 *
 * Why it matters here more than on most sites: on an iPhone the club can only
 * send notifications once it is on the Home Screen, and it opens full screen
 * and in one tap. iOS keeps the Home Screen app's sign-in separate from
 * Safari's, so it says so: one more sign-in, once.
 *
 * A card above the tab bar rather than a box over the screen: it pushes the
 * page up instead of covering it, and it is closed with one press, which
 * snoozes it for two weeks. Me, then Settings, keeps the same steps for
 * whenever somebody wants them. Where the browser offers its own install
 * prompt (Chrome and Samsung Internet on Android), the button is Install and
 * shows that prompt; everywhere else it shows the steps for this browser.
 *
 * Not in the installed app, not on a desktop, and not in the first moments
 * after a screen opens, so it is not the first thing anybody sees.
 */
export function InstallNudge() {
  const { canPrompt, installed, prompt } = useInstallPrompt();
  const [platform] = useState<InstallPlatform>(() => currentInstallPlatform());
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => nudgeSnoozed());
  const [showing, setShowing] = useState(false);
  const announce = useAnnounce();

  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (installed || dismissed || !ready || !isHandheld(platform)) {
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
    snoozeNudge();
    setDismissed(true);
    announce(`Hidden for ${NUDGE_SNOOZE_DAYS} days. The steps are on Me, under Settings.`);
  }

  return (
    <>
      <aside
        aria-label="Add the club to your Home Screen"
        className="z-30 flex-none border-line border-t bg-paper px-4 py-3 md:hidden"
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
              Put the club on your Home Screen
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-ink2 leading-[1.45]">
              {platform.startsWith('ios')
                ? 'Open it in one tap, and get notifications on your iPhone.'
                : 'Open it in one tap, full screen, like any other app.'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (canPrompt) {
                  void prompt();
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
          Add the club to your Home Screen
        </h2>
        {intro ? <p className="mt-1.5 text-[0.875rem] text-ink2 leading-[1.5]">{intro}</p> : null}
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
            The Home Screen app signs in separately from your browser, so you will sign in once more
            inside it. On an iPhone, notifications only work from there.
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
 * closed the nudge, or who is on a computer. Nothing in the installed app.
 */
export function InstallSettings() {
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
            if (canPrompt) void prompt();
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
