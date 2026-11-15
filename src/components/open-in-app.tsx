import type { ReactNode } from 'react';
import { openInApp, useAppLinkCode } from '@/lib/app-handoff';

/**
 * "Open in the app", for an iPhone browser (app-handoff.ts): opens the club's
 * app at `path`, signed in when `signedIn`, or the App Store where the app is
 * not installed. Shown only where appCouldOpen() says so; that is the caller's.
 */
export function OpenInAppButton({
  path,
  signedIn,
  className,
  children,
}: {
  path: string;
  signedIn: boolean;
  className?: string;
  children: ReactNode;
}) {
  const code = useAppLinkCode(signedIn);
  return (
    <button
      type="button"
      onClick={() => {
        openInApp(path, code);
      }}
      className={className}
    >
      {children}
    </button>
  );
}
