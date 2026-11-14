import { Megaphone } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { SheetGrip } from '@/components/sheet-grip';
import {
  fetchImportantPeople,
  type ImportantMessage,
  type ImportantPerson,
  remindImportant,
} from '@/lib/chat/important';
import { chatTime } from '@/lib/chat/time';
import { useDialogFocus } from '@/lib/dialog-focus';
import { cn } from '@/lib/utils';

/** The words of an Important message, or what stands for them. */
export function importantWords(body: string, photoCount: number): string {
  const said = body.trim();
  if (said !== '') return said;
  if (photoCount === 1) return 'A photograph.';
  if (photoCount > 1) return `${String(photoCount)} photographs.`;
  return 'A shared post.';
}

/**
 * Pinned above the conversation while the reader has an Important message to
 * acknowledge (the owner, 2026-11-13: "the message floats until they
 * acknowledge it"). The oldest first; the words in full, so it reads however
 * much was said after it. Large buttons, not a gesture.
 */
export function ImportantBanner({
  waiting,
  busy,
  error,
  onAcknowledge,
  onShow,
}: {
  waiting: ImportantMessage[];
  busy: boolean;
  error: string | null;
  onAcknowledge: (messageId: string) => void;
  onShow: (messageId: string) => void;
}) {
  const first = waiting[0];
  if (!first) return null;
  const more = waiting.length - 1;
  return (
    <section
      aria-label="Important message"
      className="flex-none border-gold border-b-2 bg-gold-lt px-[18px] py-3"
    >
      <div className="mx-auto w-full max-w-[720px]">
        <p className="flex items-center gap-1.5 font-bold text-[0.71875rem] text-gold-ink uppercase tracking-[0.06em]">
          <Megaphone aria-hidden="true" className="h-4 w-4" />
          Important{more > 0 ? ` · 1 of ${String(waiting.length)}` : ''}
        </p>
        <p className="mt-1 line-clamp-4 whitespace-pre-line text-[0.875rem] text-ink leading-[1.5]">
          <span className="font-bold">{first.authorName ?? 'Deleted member'}: </span>
          {importantWords(first.body, first.photoCount)}
        </p>
        {error ? (
          <p role="alert" className="mt-1.5 text-[0.8125rem] text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onAcknowledge(first.messageId);
            }}
            className="min-h-[44px] rounded-full bg-action px-5 font-bold font-head text-[0.875rem] text-white hover:bg-action-hi disabled:opacity-60"
          >
            {busy ? 'Acknowledging…' : 'Acknowledge'}
          </button>
          <button
            type="button"
            onClick={() => {
              onShow(first.messageId);
            }}
            className="min-h-[44px] rounded-full border border-gold-dp bg-paper px-4 font-bold text-[0.84375rem] text-gold-ink hover:bg-gold-lt"
          >
            Show in the conversation
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Who has acknowledged an Important message, and who has not yet, for anyone
 * in the group. Whoever may mark it can remind those who have not (the owner,
 * 2026-11-13: "re-ping the non-acks or just let it be").
 */
export function ImportantPeopleSheet({
  messageId,
  canRemind,
  onClose,
}: {
  messageId: string;
  canRemind: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [people, setPeople] = useState<ImportantPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState<string | null>(null);

  useDialogFocus(dialog, heading, onClose);

  useEffect(() => {
    let live = true;
    fetchImportantPeople(messageId).then(
      (rows) => {
        if (live) setPeople(rows);
      },
      () => {
        if (live) setError('Could not load who acknowledged it.');
      },
    );
    return () => {
      live = false;
    };
  }, [messageId]);

  const done = (people ?? []).filter((p) => p.acknowledgedAt !== null);
  const notYet = (people ?? []).filter((p) => p.acknowledgedAt === null);

  async function remind() {
    setReminding(true);
    setReminded(null);
    const result = await remindImportant(messageId);
    setReminding(false);
    setReminded(
      result.ok
        ? `Reminded ${notYet.length === 1 ? '1 person' : `${String(notYet.length)} people`}.`
        : result.error,
    );
  }

  const row = (person: ImportantPerson) => (
    <li
      key={person.memberId}
      className="flex items-center gap-3 border-line border-b py-3 last:border-b-0"
    >
      <MemberAvatar
        id={person.memberId}
        displayName={person.displayName}
        photoPath={person.photoPath}
        photoAlt={person.photoAlt}
      />
      <span className="min-w-0 flex-1">
        <Link
          to={`/peers/${person.memberId}`}
          className="block font-extrabold font-head text-[0.90625rem] text-ink underline-offset-2 hover:underline"
        >
          {person.displayName}
        </Link>
        <span className="block text-[0.78125rem] text-grey">
          {person.acknowledgedAt ? `Acknowledged ${chatTime(person.acknowledgedAt)}` : 'Not yet'}
        </span>
      </span>
    </li>
  );

  return createPortal(
    <div>
      <button
        type="button"
        aria-label="Close who acknowledged"
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
        <SheetGrip sheet={dialog} onClose={onClose} />
        <div className="flex-none px-[18px] pt-1 lg:pt-5">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] tracking-[-0.01em] outline-none"
          >
            Who acknowledged
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink2">
            {error ??
              (people === null
                ? 'Loading…'
                : `${String(done.length)} of ${String(people.length)}. Everyone in the group can see this.`)}
          </p>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-[18px]">
          {notYet.length > 0 ? (
            <>
              <h3 className="mt-2 font-bold text-[0.78125rem] text-grey">Not yet</h3>
              <ul>{notYet.map(row)}</ul>
            </>
          ) : null}
          {done.length > 0 ? (
            <>
              <h3 className="mt-3 font-bold text-[0.78125rem] text-grey">Acknowledged</h3>
              <ul>{done.map(row)}</ul>
            </>
          ) : null}
        </div>

        <div className="flex flex-none flex-col gap-2 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          {reminded ? (
            <p role="status" className="text-[0.8125rem] text-ink2">
              {reminded}
            </p>
          ) : null}
          <div className="flex gap-2">
            {canRemind && notYet.length > 0 ? (
              <button
                type="button"
                disabled={reminding}
                onClick={() => {
                  void remind();
                }}
                className="min-h-[48px] flex-1 rounded-xl border border-line bg-paper px-4 font-bold font-head text-[0.9375rem] text-emphasis hover:bg-tint disabled:opacity-60"
              >
                {reminding ? 'Reminding…' : 'Remind them'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors hover:bg-action-hi"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
