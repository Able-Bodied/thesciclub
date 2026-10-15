import { useCallback, useState } from 'react';
import { useForceLight } from '@/lib/accessibility';
import { useAccount } from '@/lib/account';
import { askOnOpening, openingFacts } from '@/lib/push/notifications';
import { NotificationsStep } from '@/routes/onboarding/notifications-step';

/**
 * The first time the club is opened from the Home Screen, "Turn on
 * notifications?" before anything else (the owner, 2026-10-05). Why, and what
 * "the first time" means: `askOnOpening` in src/lib/push/notifications.ts.
 *
 * Since 2026-10-14 the only place it is asked unprompted: signing up no
 * longer asks, because most people join in a browser before installing.
 * NotificationsStep remembers that this phone has been asked. Decided once, on the first render: the facts are
 * synchronous, so a member who is not asked never sees this flash past.
 */
export function AskOnOpening({ children }: { children: React.ReactNode }) {
  const [asking, setAsking] = useState(() => askOnOpening(openingFacts()));
  const done = useCallback(() => {
    setAsking(false);
  }, []);
  if (!asking) return <>{children}</>;
  return <Asking onDone={done} />;
}

function Asking({ onDone }: { onDone: () => void }) {
  useForceLight();
  const { userId } = useAccount();
  return <NotificationsStep userId={userId} onDone={onDone} />;
}
