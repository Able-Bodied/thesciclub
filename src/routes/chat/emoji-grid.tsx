import dataSource from 'emoji-picker-element-data/en/emojibase/data.json?url';
import { useEffect, useRef, useState } from 'react';

/**
 * Every emoji, searchable, for the reaction picker's + (the owner, 2026-11-14,
 * after WhatsApp's). emoji-picker-element, loaded only when opened. Its list
 * is served from our own files, never its default CDN, so nobody outside
 * learns who opened it and the iPhone app needs nothing else.
 */
export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let picker: HTMLElement | null = null;
    let gone = false;
    const onClick = (event: Event) => {
      const unicode = (event as CustomEvent<{ unicode?: string }>).detail.unicode;
      if (unicode) pick.current(unicode);
    };
    import('emoji-picker-element')
      .then(({ Picker }) => {
        if (gone || !box.current) return;
        picker = new Picker({ dataSource, locale: 'en' });
        picker.className = 'light';
        // The app's own colours, light or dark, in place of the picker's.
        picker.setAttribute(
          'style',
          [
            'width:100%',
            'height:min(380px,52dvh)',
            '--background:var(--paper)',
            '--border-color:var(--line)',
            '--border-size:0',
            '--indicator-color:var(--emphasis)',
            '--input-border-color:var(--line)',
            '--input-font-color:var(--ink)',
            '--input-placeholder-color:var(--grey)',
            '--input-font-size:1rem',
            '--input-border-radius:0.75rem',
            '--category-font-color:var(--grey)',
            '--button-hover-background:var(--tint)',
            '--button-active-background:var(--tint)',
            '--outline-color:var(--emphasis)',
            '--emoji-size:1.75rem',
          ].join(';'),
        );
        picker.addEventListener('emoji-click', onClick);
        box.current.append(picker);
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      picker?.removeEventListener('emoji-click', onClick);
      picker?.remove();
    };
  }, []);
  return (
    <div ref={box} className="mt-3 overflow-hidden rounded-xl border border-line">
      {failed ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          Every emoji could not load. Check the connection and try again.
        </p>
      ) : null}
    </div>
  );
}
