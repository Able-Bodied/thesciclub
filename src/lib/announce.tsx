import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * Saying that something worked.
 *
 * Errors here are `role="alert"`, and they are heard. Success was silent: a
 * saved form, an RSVP, a like, a follow changed what was on screen and said
 * nothing, and somebody who cannot see the screen pressed a button and heard
 * no answer. WAI's tip 6 asks for confirmation as well as errors.
 *
 * One polite live region for the whole app, rather than one per screen,
 * because the place a save finishes is not always still on screen: Your
 * details saves and goes back to Me, and a region on the details page would
 * be unmounted before it was read. This one is above the routes.
 *
 * One message at a time, the newest. A message is cleared before it is set,
 * so the same words twice ("Liked." on two posts) are heard twice, and
 * cleared again a few seconds later, so the region is not found holding
 * yesterday's news by somebody reading the page line by line.
 *
 * Off the screen, because what it says is already on it.
 */
type Announce = (message: string) => void;

// Outside a provider — a screen's own test — announcing does nothing.
const AnnounceContext = createContext<Announce>(() => undefined);

/** How long a message stays in the region after it is spoken. */
const CLEAR_AFTER_MS = 5000;

export function AnnounceProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  const announce = useCallback<Announce>((next) => {
    for (const timer of timers.current) window.clearTimeout(timer);
    setMessage('');
    // A tick later, so a screen reader sees the region change even when the
    // words are the same as last time.
    timers.current = [
      window.setTimeout(() => {
        setMessage(next);
      }, 50),
      window.setTimeout(() => {
        setMessage('');
      }, CLEAR_AFTER_MS),
    ];
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}

/** Speak a short confirmation through the app's one polite live region. */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}
