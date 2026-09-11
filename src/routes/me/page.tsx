import { Link } from 'react-router-dom';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useAccount } from '@/lib/account';

/** Me — your profile, your standing, your invites. Mostly still to come. */
export default function MePage() {
  const { isAdmin } = useAccount();

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <PlaceholderScreen
        title="Me"
        blurb="Your profile, your standing in the club, and your invites."
        note="Coming with the profile survey."
      />
      {isAdmin ? (
        <div className="mx-auto w-full max-w-[480px] px-4 pb-6">
          <Link
            to="/admin"
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-navy font-bold font-head text-[15px] text-navy"
          >
            Admin
          </Link>
        </div>
      ) : null}
    </div>
  );
}
