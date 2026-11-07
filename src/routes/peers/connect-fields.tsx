import { useEffect, useState } from 'react';
import { loadMemberChoices, type MentionCandidate } from '@/lib/mentions';

/** Who can be connected: the members Peers shows, with an @name. */

export function useConnectableMembers(): MentionCandidate[] | null {
  const [members, setMembers] = useState<MentionCandidate[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadMemberChoices().then((found) => {
      if (live) setMembers(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return members;
}
