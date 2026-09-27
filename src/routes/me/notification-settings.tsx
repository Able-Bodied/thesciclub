import { type NotificationState, useDeviceNotifications } from '@/lib/push/notifications';

/**
 * Notifications, on Me, above Display.
 *
 * About *this device*, and it says so: a member with a phone and a tablet
 * turns each on separately, and "On" here promises nothing about the other.
 *
 * Every state says which it is in and what, if anything, can be done — the
 * lib's header has the five and why iOS needs two kinds of "cannot". Not drawn
 * at all until the club can send (`VITE_VAPID_PUBLIC_KEY`), nor while the
 * state is being read, so it never shows a button that is about to change.
 *
 * The sentence is a polite live region, so pressing the button is answered
 * aloud: the words change from "Off on this device." to "On for this device."
 * and a screen reader says the new ones.
 */

const SENTENCES: Record<NotificationState, string> = {
  install:
    'To get notifications on an iPhone, add the club to your Home Screen: tap Share, then Add to Home Screen, and open it from there. You will sign in again once, inside the app.',
  unsupported:
    'This device cannot show the club’s notifications. On an iPhone they need iOS 16.4 or later.',
  off: 'Off on this device.',
  on: 'On for this device.',
  refused:
    'This device has said no to the club’s notifications, and it will not ask again. To change it, open Settings, then Notifications, and find the club.',
};

export function NotificationSettings({ userId }: { userId: string | null }) {
  const { state, busy, error, turnOn, turnOff } = useDeviceNotifications(userId);
  if (state === null && error === null) return null;

  return (
    <section aria-labelledby="notification-settings-heading" className="mt-6">
      <h2
        id="notification-settings-heading"
        className="mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Notifications
      </h2>

      <div className="rounded-[17px] border border-line bg-paper p-3.5">
        {state ? (
          <p aria-live="polite" className="text-[0.875rem] text-ink2 leading-[1.45]">
            {SENTENCES[state]}
          </p>
        ) : null}

        {state === 'off' || state === 'on' ? (
          <button
            type="button"
            onClick={state === 'off' ? turnOn : turnOff}
            disabled={busy}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[11px] border-[1.6px] border-navy font-bold font-head text-[0.875rem] text-navy transition-colors hover:bg-tint disabled:opacity-50"
          >
            {busy ? 'One moment…' : state === 'off' ? 'Turn on notifications' : 'Turn off'}
          </button>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
