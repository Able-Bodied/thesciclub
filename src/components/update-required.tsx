import { useEffect, useRef } from 'react';
import { APP_STORE_URL } from '@/lib/app-update';

/** In place of the whole app when this copy is too old (src/lib/app-update.ts). */
export function UpdateRequired() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-8 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display font-extrabold text-[1.5625rem] text-ink outline-none"
      >
        Please update the app
      </h1>
      <p className="max-w-[22rem] text-[0.90625rem] text-ink2 leading-relaxed">
        This version of The SCI Club no longer works. Update it from the App Store to keep using the
        club.
      </p>
      {/* Not caught by the app's link handling (native-shell.ts leaves other
          schemes to the page), so iOS opens the App Store itself. */}
      <a
        href={APP_STORE_URL}
        className="mt-2 inline-flex min-h-[44px] items-center rounded-[13px] bg-action px-5 font-bold font-head text-[0.9375rem] text-white"
      >
        Open the App Store
      </a>
    </main>
  );
}
