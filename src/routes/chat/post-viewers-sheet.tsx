import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { fetchPostViewers, type PostViewer } from '@/lib/chat/post-viewers';
import { chatTime } from '@/lib/chat/time';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

const DEVICE_LABELS = { mobile: 'Mobile', desktop: 'Desktop' } as const;

/**
 * Who viewed a post, for administrators (the owner, 2026-10-20). Opened from
 * the view count. In a portal on the page, because the count sits inside
 * cards whose positioning would otherwise frame the sheet.
 */
export function PostViewersSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [viewers, setViewers] = useState<PostViewer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDialogFocus(dialog, heading, onClose);

  useEffect(() => {
    let live = true;
    fetchPostViewers(postId).then(
      (rows) => {
        if (live) setViewers(rows);
      },
      () => {
        if (live) setError('Could not load who viewed this post.');
      },
    );
    return () => {
      live = false;
    };
  }, [postId]);

  const summary =
    error ??
    (viewers === null
      ? 'Loading…'
      : viewers.length === 1
        ? '1 person. Only administrators can see this.'
        : `${viewers.length} people. Only administrators can see this.`);

  return createPortal(
    // Clicks stay in the sheet: React would carry them up to the card the
    // count is drawn in, which may open the post.
    // biome-ignore lint/a11y/noStaticElementInteractions: stops bubbling only, not a control
    // biome-ignore lint/a11y/useKeyWithClickEvents: stops bubbling only, not a control
    <div
      onClick={(click) => {
        click.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label="Close who viewed"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed z-[71] flex flex-col bg-canvas',
          'inset-x-0 bottom-0 mx-auto max-h-[88%] max-w-[480px] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:bottom-auto lg:top-1/2 lg:max-h-[82%] lg:w-[560px] lg:max-w-none',
          'lg:-translate-y-1/2 lg:rounded-3xl lg:shadow-[0_24px_60px_rgba(10,20,35,.35)]',
        )}
      >
        <div className="mx-auto mt-2.5 mb-1 h-[4.5px] w-[38px] flex-none rounded-[3px] bg-line lg:hidden" />
        <div className="flex-none px-[18px] pt-1 lg:pt-5">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] tracking-[-0.01em] outline-none"
          >
            Who viewed
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink2">{summary}</p>
        </div>

        <ul className="mt-3 flex-1 overflow-y-auto px-[18px]">
          {(viewers ?? []).map((viewer) => (
            <li
              key={viewer.memberId}
              className="flex items-center gap-3 border-line border-b py-3 last:border-b-0"
            >
              <MemberAvatar
                id={viewer.memberId}
                displayName={viewer.displayName}
                photoPath={viewer.photoPath}
                photoAlt={viewer.photoAlt}
              />
              <span className="min-w-0 flex-1">
                <Link
                  to={`/peers/${viewer.memberId}`}
                  className="block font-extrabold font-head text-[0.90625rem] text-ink underline-offset-2 hover:underline"
                >
                  {viewer.displayName}
                </Link>
                <span className="block text-[0.78125rem] text-grey">
                  {[
                    viewer.devices.length
                      ? viewer.devices.map((device) => DEVICE_LABELS[device]).join(' and ')
                      : 'Device not recorded',
                    viewer.seenAt ? chatTime(viewer.seenAt) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-none border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
