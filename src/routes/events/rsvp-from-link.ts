import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type InviteAnswer, inviteAnswerFrom } from '@/lib/event-invite';

/**
 * An answer pressed in an invite email (20261114070000): the event's page
 * opens with ?rsvp=going|interested|no, and once it can save (`ready`: signed
 * in, the event read, not over) it does, once, and takes the answer out of
 * the address so a reload or a later visit does not answer again.
 */
export function useRsvpFromLink(ready: boolean, save: (answer: InviteAnswer) => void): void {
  const [params, setParams] = useSearchParams();
  const answer = inviteAnswerFrom(params.get('rsvp'));
  const done = useRef(false);
  useEffect(() => {
    if (!ready || !answer || done.current) return;
    done.current = true;
    save(answer);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('rsvp');
        return next;
      },
      { replace: true },
    );
  }, [ready, answer, save, setParams]);
}

export const SAVED_FROM_LINK: Record<InviteAnswer, string> = {
  going: 'Saved from your email: you’re going.',
  interested: 'Saved from your email: you might go.',
  no: 'Saved from your email: you can’t go.',
};
