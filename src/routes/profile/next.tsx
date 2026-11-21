import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AccountProblem } from '@/components/account-problem';
import { useAccount } from '@/lib/account';
import { signInDoor } from '@/lib/sign-in-destination';
import { loadDetails } from '@/routes/profile/details-api';
import { loadAnswers } from '@/routes/profile/profile-api';
import { nextStep, stepHref } from '@/routes/profile/progress';

/**
 * Where the profile was left (the owner, 2026-11-12): the next open step, in
 * walk mode, or Your profile when nothing is open. Next on Your profile and a
 * finish-your-profile reminder both come here.
 */
export default function ProfileNextPage() {
  const account = useAccount();
  const location = useLocation();
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    if (account.status !== 'member') return;
    void Promise.all([loadDetails({ fresh: true }), loadAnswers({ fresh: true })]).then(
      ([details, answers]) => {
        if (!details.ok || !answers.ok) {
          setTo('/profile/answers');
          return;
        }
        const step = nextStep(details.details, answers.answers, answers.declined);
        const to = step ? stepHref(step, true) : '/profile/answers';
        // A pressed reminder's ?n= goes along, so it is marked read where it lands.
        const n = new URLSearchParams(location.search).get('n');
        setTo(n === null ? to : `${to}${to.includes('?') ? '&' : '?'}n=${encodeURIComponent(n)}`);
      },
    );
  }, [account.status, location.search]);

  if (account.status === 'error') return <AccountProblem account={account} />;
  if (account.status === 'loading') return <div className="min-h-dvh bg-canvas" />;
  if (account.status !== 'member')
    return <Navigate to={signInDoor(`${location.pathname}${location.search}`)} replace />;
  if (to) return <Navigate to={to} replace />;
  return (
    <p role="status" className="py-10 text-center text-[0.875rem] text-grey">
      Loading…
    </p>
  );
}
