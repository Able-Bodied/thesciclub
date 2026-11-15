import { useCallback, useEffect, useState } from 'react';
import { useForceLight } from '@/lib/accessibility';
import { useAccount } from '@/lib/account';
import {
  appOpeningFacts,
  isAppPush,
  mayAskForNotifications,
  openingFacts,
  SENT_EVENT,
} from '@/lib/push/notifications';
import { NotificationsStep } from '@/routes/onboarding/notifications-step';

/**
 * "Get notified when they reply?", once a member has sent something: a
 * message, a reply or a topic (the owner, 2026-11-15: "trigger after the first
 * time a user makes a comment or sends a chat. Explain that notifications will
 * let them get notified after a response"). Until then the club does not ask:
 * it used to, the first time the installed app opened (2026-10-05), before
 * there was anything to be told about.
 *
 * Asked where it can be answered (`mayAskForNotifications`): the installed app
 * or the iPhone app, while the phone has not said yes or no, and not within
 * five days of Not now. NotificationsStep remembers that this phone was asked.
 * Over the page, which is still there underneath once it is answered.
 */
export function AskAfterSending({ children }: { children: React.ReactNode }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let live = true;
    function sent() {
      const facts = isAppPush() ? appOpeningFacts() : Promise.resolve(openingFacts());
      facts.then(
        (known) => {
          if (live && mayAskForNotifications(known)) setAsking(true);
        },
        () => undefined,
      );
    }
    window.addEventListener(SENT_EVENT, sent);
    return () => {
      live = false;
      window.removeEventListener(SENT_EVENT, sent);
    };
  }, []);
  const done = useCallback(() => {
    setAsking(false);
  }, []);
  return (
    <>
      {children}
      {asking ? <Asking onDone={done} /> : null}
    </>
  );
}

function Asking({ onDone }: { onDone: () => void }) {
  useForceLight();
  const { userId } = useAccount();
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <NotificationsStep userId={userId} onDone={onDone} />
    </div>
  );
}
