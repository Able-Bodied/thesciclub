import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { useAnnounce } from '@/lib/announce';
import {
  answerFamilyLink,
  type FamilyLink,
  familyAs,
  RELATION_LABELS,
  type Relation,
  removeFamilyLink,
} from '@/lib/family';

/** What the asker is to the other, from what the other is to the asker. */
export function inverse(relation: Relation): Relation {
  if (relation === 'parent') return 'child';
  if (relation === 'child') return 'parent';
  return relation;
}

const BUTTON =
  'min-h-[44px] rounded-xl px-4 font-bold font-head text-[0.875rem] transition-colors disabled:opacity-40';

/**
 * A profile's family (src/lib/family.ts): linked family for every member who
 * may see both, an ask only to the two in it. `member` is the profile's.
 */
export function FamilySection({
  member,
  readerId,
  family,
  onChanged,
}: {
  member: { id: string; displayName: string };
  readerId: string | null;
  family: FamilyLink[];
  onChanged: () => void;
}) {
  const announce = useAnnounce();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const own = readerId === member.id;

  function run(linkId: string, work: Promise<{ ok: boolean; error?: string }>, said: string) {
    setBusy(linkId);
    setFailure(null);
    void work.then((result) => {
      setBusy(null);
      if (!result.ok) {
        setFailure(result.error ?? 'That did not work.');
        return;
      }
      announce(said);
      onChanged();
    });
  }

  const asked = family.filter((link) => link.state === 'asked_of_me');
  const waiting = family.filter((link) => link.state === 'asked_by_me');
  const linked = family.filter((link) => link.state === 'linked');
  if (asked.length === 0 && waiting.length === 0 && linked.length === 0) return null;

  return (
    <div className="flow-root">
      {asked.map((link) => {
        // On the asker's profile the row is the reader; on the reader's own, the asker.
        const askerName = link.memberId === readerId ? member.displayName : link.displayName;
        const as = link.memberId === readerId ? inverse(link.relation) : link.relation;
        return (
          <div
            key={link.linkId}
            className="mt-4 rounded-[17px] border border-emphasis/40 bg-tint px-3.5 py-3"
          >
            <p className="text-[0.9rem] text-ink leading-[1.5]">
              <b>{askerName}</b> asked to be linked to you as family{familyAs(as)}. Members will see
              it on both of your profiles.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === link.linkId}
                onClick={() => {
                  run(
                    link.linkId,
                    answerFamilyLink(link.linkId, true),
                    `You and ${askerName} are linked as family.`,
                  );
                }}
                className={`${BUTTON} bg-action text-white`}
              >
                Yes, link us
              </button>
              <button
                type="button"
                disabled={busy === link.linkId}
                onClick={() => {
                  run(link.linkId, answerFamilyLink(link.linkId, false), 'Not linked.');
                }}
                className={`${BUTTON} border border-line bg-paper text-emphasis`}
              >
                No
              </button>
            </div>
          </div>
        );
      })}

      {waiting.map((link) => {
        const other = link.memberId === readerId ? member.displayName : link.displayName;
        return (
          <div
            key={link.linkId}
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[17px] border border-line bg-paper px-3.5 py-2.5"
          >
            <p className="flex-1 text-[0.85rem] text-ink2 leading-[1.45]">
              You asked to link {other} as family. Waiting for them to say yes.
            </p>
            <button
              type="button"
              disabled={busy === link.linkId}
              onClick={() => {
                run(link.linkId, removeFamilyLink(link.linkId), 'Request cancelled.');
              }}
              className="min-h-[44px] font-bold text-[0.8125rem] text-emphasis underline underline-offset-2"
            >
              Cancel request
            </button>
          </div>
        );
      })}

      {failure ? (
        <p role="alert" className="mt-3 text-[0.8125rem] text-destructive leading-[1.45]">
          {failure}
        </p>
      ) : null}

      {linked.length > 0 ? (
        <>
          <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
            Family
          </h2>
          <ul className="flex flex-col gap-2">
            {linked.map((link) => (
              <li
                key={link.linkId}
                className="flex items-center gap-3 rounded-[17px] border border-line bg-paper px-3 py-2"
              >
                <Link
                  to={`/peers/${link.memberId}`}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3"
                >
                  <MemberAvatar
                    id={link.memberId}
                    displayName={link.displayName}
                    photoPath={link.photoPath}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-[0.875rem] text-ink">
                      {link.memberId === readerId ? `${link.displayName} (you)` : link.displayName}
                    </span>
                    <span className="block text-[0.78125rem] text-grey">
                      {RELATION_LABELS[link.relation]}
                    </span>
                  </span>
                </Link>
                {own ? (
                  <button
                    type="button"
                    disabled={busy === link.linkId}
                    aria-label={`Remove ${link.displayName} from your family`}
                    onClick={() => {
                      run(
                        link.linkId,
                        removeFamilyLink(link.linkId),
                        `${link.displayName} is no longer linked as family.`,
                      );
                    }}
                    className="min-h-[44px] px-1 font-bold text-[0.8125rem] text-grey underline underline-offset-2 hover:text-destructive"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
