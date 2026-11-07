import { useEffect, useState } from 'react';
import { loadMentionCandidates, type MentionCandidate } from '@/lib/mentions';

/** Who can be connected: the members Peers shows, with an @name. */

export function useConnectableMembers(): MentionCandidate[] | null {
  const [members, setMembers] = useState<MentionCandidate[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadMentionCandidates().then((found) => {
      if (live) setMembers(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return members;
}
