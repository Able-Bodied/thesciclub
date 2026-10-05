import { Loader2 } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { markNotificationsAsked, useDeviceNotifications } from '@/lib/push/notifications';
import { LinkButton, PrimaryButton, Question, StepFrame, Sub } from '@/routes/onboarding/chrome';

/**
 * Asked once, after the profile is saved and before Home.
 *
 * The owner, 2026-10-01: ask for notifications at the end of signing up, and
 * ask somebody who pressed "Finish later" too, as they enter. So it is not a
 * step of the wizard — "Finish later" skips those — but the screen between the
 * insert and Home, whichever button finished. It cannot come sooner: a device
 * is subscribed against a member row (`push_subscribe`), which does not exist
 * until the insert.
 *
 * It only asks what can be answered. The page does not come here at all while
 * the club cannot send (`vapidPublicKey()`), and this screen goes straight on
 * when the device is already on, has refused before (the system will not ask
 * again), or cannot show notifications at all. On an iPhone in a Safari tab
 * nothing can be asked until the club is on the Home Screen, so that state
 * says how instead of offering a button. Me has the same row for later.
 *
 * "Turn on notifications" is the form's submit, so the permission request is
 * inside the tap, which iOS requires — see `turnOnNotifications`.
 *
 * Also the screen the installed app opens on, once, before the club
 * (AskOnOpening, 2026-10-05). Whichever way this screen ends, unless it only
 * said how to install, this phone has been asked, so neither place asks it
 * again.
 */
export function NotificationsStep({
  userId,
  onDone,
}: {
  userId: string | null;
  onDone: () => void;
}) {
  const { state, busy, error, turnOn } = useDeviceNotifications(userId);

  const finish = useCallback(() => {
    if (state !== null && state !== 'install') markNotificationsAsked();
    onDone();
  }, [state, onDone]);

  // Nothing to ask: on already, refused before, or a device that cannot. And
  // once asked, the answer — yes or no — is the end of this screen.
  useEffect(() => {
    if (state === 'on' || state === 'refused' || state === 'unsupported') finish();
  }, [state, finish]);

  const install = state === 'install';
  const loading = state === null && error === null;

  return (
    <StepFrame
      stepNumber={null}
      totalSteps={0}
      onSubmit={() => {
        if (busy || loading) return;
        if (install || state !== 'off') finish();
        else turnOn();
      }}
      footer={
        <>
          {error ? (
            <p role="alert" className="mb-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          <PrimaryButton disabled={busy || loading}>
            {busy || loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state === 'off' ? (
              'Turn on notifications'
            ) : (
              'Continue'
            )}
          </PrimaryButton>
          {state === 'off' ? <LinkButton onClick={finish}>Not now</LinkButton> : null}
        </>
      }
    >
      <Question>{install ? 'Get notifications on your iPhone' : 'Turn on notifications?'}</Question>
      <Sub>
        {install
          ? 'Add the club to your Home Screen: tap Share, then Add to Home Screen, and open it from there. You will sign in once more inside the app.'
          : 'Know when somebody messages you or replies to your topic. You can change this any time on Me.'}
      </Sub>
    </StepFrame>
  );
}
