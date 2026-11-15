import type { ReactNode } from 'react';
import { openInApp, useAppLinkCode } from '@/lib/app-handoff';

/**
 * "Open in the app", for an iPhone browser (app-handoff.ts): opens the club's
 * app at `path`, signed in when `signedIn`, or the App Store where the app is
 * not installed. Only in the nudge (install-nudge.tsx), after signing in.
 */
export function OpenInAppButton({
  path,
  signedIn,
  className,
  onOpen,
  children,
}: {
  path: string;
  signedIn: boolean;
  className?: string;
  /** Called as it is pressed. */
  onOpen?: (() => void) | undefined;
  children: ReactNode;
}) {
  const code = useAppLinkCode(signedIn);
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openInApp(path, code);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
