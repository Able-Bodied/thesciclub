import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { publicEventUrl } from '@/lib/event-audience';
import { shareLink } from '@/lib/share-link';

/**
 * Share, small, across from Back at the top (the owner, 2026-11-02: "so
 * members can share to each other", "a subtle share icon like on topics"). The
 * phone's share sheet where there is one, else the link is copied. It is the
 * event's public link: a member who opens it is taken to the members' page
 * (public-event/page.tsx), anybody else sees the public one.
 */
export function ShareEventButton({
  eventId,
  shortLink,
  title,
}: {
  eventId: string;
  shortLink: string | null;
  title: string;
}) {
  const announce = useAnnounce();
  // Copied, said on the button itself, since nothing else on the screen changes.
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => {
      setSaid(null);
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [said]);

  async function share() {
    const outcome = await shareLink({
      url: publicEventUrl(eventId, shortLink),
      title,
      text: `${title}, on The SCI Club.`,
    });
    if (outcome === 'copied') {
      setSaid('Link copied');
      announce('Link copied.');
    } else if (outcome === 'failed') {
      setSaid('Could not share');
      announce('Could not share the link.');
    }
  }

  return (
    <button
      type="button"
      aria-label={said ?? 'Share this event'}
      onClick={() => {
        void share();
      }}
      className="-mt-2.5 -mr-2 inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full px-3 text-[#B9CADF] text-[0.8125rem] hover:bg-white/10"
    >
      <Send aria-hidden="true" className="h-[14px] w-[14px]" />
      {said ?? 'Share'}
    </button>
  );
}
