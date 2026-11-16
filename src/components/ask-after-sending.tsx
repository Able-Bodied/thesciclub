import { useCallback, useEffect, useState } from 'react';
import { useForceLight } from '@/lib/accessibility';
import { useAccount } from '@/lib/account';
import {
  type AskReason,
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
 * Going on an event asks too, as "Get a reminder before it starts?" (the
 * owner, 2026-11-15): a member who only reads is asked there or never.
 *
 * Asked where it can be answered (`mayAskForNotifications`): the installed app
 * or the iPhone app, while the phone has not said yes or no, and not within
 * five days of Not now. NotificationsStep remembers that this phone was asked.
 * Over the page, which is still there underneath once it is answered.
 */
export function AskAfterSending({ children }: { children: React.ReactNode }) {
  const [asking, setAsking] = useState<AskReason | null>(null);
  useEffect(() => {
    let live = true;
    function sent(event: Event) {
      const reason: AskReason =
        (event as CustomEvent<unknown>).detail === 'going' ? 'going' : 'sent';
      const facts = isAppPush() ? appOpeningFacts() : Promise.resolve(openingFacts());
      facts.then(
        (known) => {
          if (live && mayAskForNotifications(known)) setAsking(reason);
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
    setAsking(null);
  }, []);
  return (
    <>
      {children}
      {asking ? <Asking reason={asking} onDone={done} /> : null}
    </>
  );
}

function Asking({ reason, onDone }: { reason: AskReason; onDone: () => void }) {
  useForceLight();
  const { userId } = useAccount();
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <NotificationsStep userId={userId} reason={reason} onDone={onDone} />
    </div>
  );
}
