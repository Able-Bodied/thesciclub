import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnnounce } from '@/lib/announce';
import { useDialogFocus } from '@/lib/dialog-focus';
import { type EventVisibility, setEventVisibility } from '@/lib/event-audience';
import { cn } from '@/lib/utils';
import {
  type AudienceChoice,
  AudienceField,
  type AudienceOrganization,
  audienceReady,
  sameAudience,
} from '@/routes/events/audience-field';
import type { ClubEvent } from '@/types/domain';

/**
 * Who can see an event, changed from its page (the owner, 2026-11-06): by
 * whoever may change it, and by an org admin of its organization on an
 * imported event too, which has no form of theirs to change it on. The
 * geometry and the ways out are IntroduceSheet's.
 */

export function choiceFrom(visibility: EventVisibility, hostId: string | null): AudienceChoice {
  return {
    audience: visibility.audience === 'followers' ? 'organizations' : visibility.audience,
    groups: visibility.groups ?? [],
    organizations:
      visibility.audience === 'followers' && hostId
        ? [hostId]
        : visibility.organizations.map((o) => o.id),
    people: (visibility.invitees ?? []).map((m) => ({ ...m, photoAlt: null })),
  };
}

export function VisibilitySheet({
  event,
  visibility,
  organizations,
  onCancel,
  onSaved,
}: {
  event: Pick<ClubEvent, 'id' | 'title' | 'seriesId' | 'organizationId'>;
  visibility: EventVisibility;
  /** Whose members it can be for: the organizations they are an org admin of. */
  organizations: AudienceOrganization[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const announce = useAnnounce();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(dialog, heading, onCancel);
  const [initial] = useState(() => choiceFrom(visibility, event.organizationId));
  const [choice, setChoice] = useState<AudienceChoice>(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Organizations already chosen stay listed, whoever chose them.
  const offered = [
    ...organizations,
    ...visibility.organizations
      .filter((o) => !organizations.some((mine) => mine.id === o.id))
      .map((o) => ({ id: o.id, name: o.name })),
  ];
  const changed = !sameAudience(choice, initial);

  function save() {
    if (busy || !changed || !audienceReady(choice)) return;
    setBusy(true);
    void setEventVisibility(event.id, {
      audience: choice.audience,
      groups: choice.groups,
      organizations: choice.organizations,
      people: choice.people.map((p) => p.id),
    }).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      announce(
        result.value > 0
          ? `Saved. ${result.value === 1 ? '1 person was' : `${result.value} people were`} told they’re invited.`
          : 'Saved.',
      );
      onSaved();
    });
  }

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close without changing"
        tabIndex={-1}
        onClick={onCancel}
        className="fixed inset-0 z-[80] bg-[rgba(10,20,35,.5)]"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'fixed z-[81] flex flex-col bg-paper text-ink',
          'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl shadow-[0_-14px_40px_rgba(10,20,35,.3)]',
          'lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[82dvh] lg:w-[520px]',
          'lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl',
        )}
      >
        <div className="flex-1 overflow-y-auto px-[18px] pt-5 pb-4">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="font-extrabold font-head text-[1.3125rem] text-ink tracking-[-0.01em] outline-none"
          >
            Who can see it
          </h2>
          <p className="mt-1 text-[0.875rem] text-ink2 leading-[1.5]">
            {event.title}
            {event.seriesId ? ', and its later dates' : ''}
          </p>
          <AudienceField
            value={choice}
            onChange={(next) => {
              setChoice(next);
              setFailure(null);
            }}
            organizations={offered}
            labelClassName="sr-only"
            hintClassName="mt-2 text-[0.8125rem] text-grey leading-[1.45]"
          />
          {failure ? (
            <p
              role="alert"
              className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.875rem] text-destructive leading-[1.45]"
            >
              {failure}
            </p>
          ) : null}
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2.5 border-line border-t px-[18px] pt-3 pb-6 lg:pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl bg-tint px-5 font-bold font-head text-[0.9375rem] text-emphasis transition-colors hover:bg-line"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !changed || !audienceReady(choice)}
            className="min-h-[48px] flex-1 rounded-xl bg-action px-5 font-bold font-head text-[0.9375rem] text-white transition-colors disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
