import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteAttachments } from '@/lib/chat/attachments';
import { useChatAuthors } from '@/lib/chat/authors';
import { resolveReport } from '@/lib/chat/reports';
import { removeMessage } from '@/lib/chat/threads';
import { chatTimeLong } from '@/lib/chat/time';
import { removePost } from '@/lib/chat/topics';
import type { ChatAuthor, ChatReport } from '@/lib/chat/types';
import { ReasonField, SmallButton } from '@/routes/admin/controls';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';

/**
 * What members have handed over, for an administrator.
 *
 * ---------------------------------------------------------------------------
 * A row is the report, not a window into the conversation
 * ---------------------------------------------------------------------------
 * The snapshot, where it was said in words, who wrote it, who reported it and
 * how many have. There is nothing here that opens a direct conversation and
 * there must never be: `admin_chat_reports()` returns no thread id at all, so
 * this screen could not offer one even if somebody added the button. That is
 * the point of the shape — the promise on /chat that a conversation is private
 * even from administrators has to survive somebody reporting a message out of
 * it, and a promise enforced by a returned column is one nobody can erode by
 * accident.
 *
 * A post is different and does carry its room and topic, because a room is
 * readable by every member including an administrator. Opening it discloses
 * nothing that was not already open, and reading the exchange around a post is
 * most of deciding what to do about it.
 *
 * ---------------------------------------------------------------------------
 * Three actions, and the one that is deliberately missing
 * ---------------------------------------------------------------------------
 * Remove it, open the topic, go to the member. There is no strike control
 * here. Issuing one ends a membership at the third, and that decision belongs
 * on the member's row where the whole picture is — their other strikes, their
 * status, the Pause and Remove beside it. A second strike button on a screen
 * that shows one message out of context is how somebody gets struck for a
 * sentence rather than for what they have been doing. "Go to Bo" is the link
 * between the two, and it is a navigation rather than an action.
 *
 * Nothing is automatic at any number of reports either. `report_count` is
 * information, not a threshold.
 *
 * ---------------------------------------------------------------------------
 * Remove is not offered for a direct message
 * ---------------------------------------------------------------------------
 * The owner's call, 2026-09-21. Removing a post from a room or a message from
 * a group protects everybody else who can see it. Removing a message from a
 * direct conversation protects nobody: the reporter has already read it and
 * the sender wrote it. The remedy for a bad direct message is on the member's
 * row — a strike, a pause, or removal from the club — and the report keeps the
 * copy whatever happens, so nothing is lost by not offering the button. The
 * row says so in a sentence rather than leaving a gap where a control would
 * be. `contextKind` is recorded when the report is filed, so this still holds
 * once the original message is gone.
 *
 * ---------------------------------------------------------------------------
 * The two names are links
 * ---------------------------------------------------------------------------
 * Who reported and who was reported both open somewhere: the profile, when
 * that member has one, so an administrator can see who is talking about what
 * with one tap; otherwise their row on this screen, which is where somebody
 * hidden from Peers can still be found — /peers/:id is built on
 * browse_members and does not know they exist. A former member is a word, not
 * a link. Which of the two a name gets comes from chat_authors.has_profile.
 *
 * ---------------------------------------------------------------------------
 * Resolved reports collapse, and are not deleted
 * ---------------------------------------------------------------------------
 * The next administrator to look at somebody needs to know what was decided
 * about them last time, and "resolved" is not a decision — which is why the
 * sentence is required by the database rather than by this form.
 */
export function ReportsSection({
  reports,
  loading,
  error,
  reload,
  onGoToMember,
}: {
  reports: ChatReport[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Switches to the Members tab and scrolls that member's row into view. */
  onGoToMember: (memberId: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // For has_profile only — the names themselves come with the report, so a
  // former member is still named after chat_authors has stopped knowing them.
  const authors = useChatAuthors(reports.flatMap((r) => [r.reporterId, r.reportedAuthorId]));

  const open = reports.filter((r) => r.resolvedAt === null);
  const closed = reports.filter((r) => r.resolvedAt !== null);

  function removeReported(report: ChatReport) {
    const what = report.kind === 'post' ? 'post' : 'message';
    const ok = window.confirm(
      `Remove this ${what}?\n\nIts text is replaced with "Removed by an administrator" for everybody who can see it. The row stays, so numbering and replies hold, and what it said is kept out of reach.`,
    );
    if (!ok) return;
    const id = report.kind === 'post' ? report.postId : report.messageId;
    if (!id) {
      setFailure(`That ${what} is no longer there.`);
      return;
    }
    setBusyId(report.id);
    setFailure(null);
    const run = report.kind === 'post' ? removePost(id) : removeMessage(id);
    run
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        // The row is blanked by the function; the files go through the
        // storage API, which an administrator can reach for exactly these
        // because the report names them — see 20260918200000.
        if (report.attachments.length > 0) void deleteAttachments(report.attachments);
        // Re-read, so the row stops offering to remove what is already gone.
        reload();
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setBusyId(null);
      });
  }

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
          Reports
        </h2>
        <span className="text-[0.75rem] text-grey">
          {/* A count of zero is not drawn as "0 open". */}
          {open.length === 0 ? 'nothing waiting' : `${open.length} waiting`}
        </span>
      </div>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        One post or one message, handed over by the member who saw it. Nothing else about a
        conversation comes with it, and there is no way from here into one.
      </p>

      {failure ? (
        <p className="mb-2 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
          {failure}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
        {loading ? (
          <p className="py-6 text-center text-[0.8125rem] text-grey">Loading the reports…</p>
        ) : error ? (
          <p className="px-3 py-6 text-center text-[0.8125rem] text-grey leading-[1.45]">{error}</p>
        ) : open.length === 0 ? (
          <p className="px-3 py-6 text-center text-[0.8125rem] text-grey leading-[1.45]">
            Nothing has been reported. Members can hand over a post or a message from where they are
            reading it.
          </p>
        ) : (
          open.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              authors={authors}
              busy={busyId === report.id}
              onRemove={() => {
                removeReported(report);
              }}
              onGoToMember={onGoToMember}
              onResolved={reload}
              onFailure={setFailure}
            />
          ))
        )}
      </div>

      {closed.length > 0 ? (
        <>
          <h2 className="mt-5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
            Settled
          </h2>
          <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
            Kept, not deleted: what was decided about somebody last time is most of deciding what to
            do about them this time.
          </p>
          <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
            {closed.map((report) => (
              <div key={report.id} className="border-line border-b p-3 last:border-b-0">
                <Where report={report} authors={authors} onGoToMember={onGoToMember} />
                <Snapshot report={report} />
                <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
                  {report.resolvedByName ?? 'A former member'} settled this
                  {report.resolvedAt ? ` on ${chatTimeLong(report.resolvedAt)}` : ''}:{' '}
                  <span className="text-ink2">{report.resolution}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function ReportRow({
  report,
  authors,
  busy,
  onRemove,
  onGoToMember,
  onResolved,
  onFailure,
}: {
  report: ChatReport;
  authors: Map<string, ChatAuthor>;
  busy: boolean;
  onRemove: () => void;
  onGoToMember: (memberId: string) => void;
  onResolved: () => void;
  onFailure: (said: string | null) => void;
}) {
  const [settling, setSettling] = useState(false);
  // Bound to a const so the callback below closes over a narrowed id rather
  // than re-reading a nullable field.
  const authorId = report.reportedAuthorId;
  const [said, setSaid] = useState('');
  const [saving, setSaving] = useState(false);

  function settle() {
    if (!said.trim() || saving) return;
    setSaving(true);
    onFailure(null);
    // The write is here rather than in the parent because the sentence it
    // needs lives in this row's own state.
    resolveReport(report.id, said)
      .then((result) => {
        if (!result.ok) {
          onFailure(result.error);
          return;
        }
        setSettling(false);
        setSaid('');
        onResolved();
      })
      .catch((e: unknown) => {
        onFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="border-line border-b p-3 last:border-b-0">
      <Where report={report} authors={authors} onGoToMember={onGoToMember} />
      <Snapshot report={report} />

      <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
        Reported by{' '}
        <MemberName
          id={report.reporterId}
          name={report.reporterName}
          gone="a former member"
          authors={authors}
          onGoToMember={onGoToMember}
        />{' '}
        on {chatTimeLong(report.createdAt)}
        {/* Only past one. "1 member reported this" is a sentence saying what
            the row already says. */}
        {report.reportCount > 1 ? ` · ${report.reportCount} members reported this` : ''}
      </p>
      {report.note ? (
        <p className="mt-1.5 text-[0.8125rem] text-ink2 leading-[1.5]">“{report.note}”</p>
      ) : null}

      {report.contextKind === 'direct' ? (
        <p className="mt-1.5 text-[0.75rem] text-grey leading-[1.45]">
          A direct message is not removed from here: it protects nobody who has not already read it.
          What to do about it is on their row.
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {report.contextKind === 'direct' ? null : report.alreadyRemoved ? (
          <span className="rounded-full bg-tint px-3 py-1.5 font-semibold text-[0.75rem] text-grey">
            Already removed
          </span>
        ) : (
          <SmallButton destructive disabled={busy} onClick={onRemove}>
            {busy ? 'Removing…' : `Remove the ${report.kind}`}
          </SmallButton>
        )}
        {/* A post only, and never a message: there is no thread id in the
            answer to build a link out of, deliberately. */}
        {report.kind === 'post' && report.roomId && report.topicId ? (
          <Link
            to={`/chat/rooms/${report.roomId}/topics/${report.topicId}`}
            data-target="small"
            className="whitespace-nowrap rounded-full bg-tint px-3 py-1.5 font-semibold text-[0.75rem] text-navy transition-colors hover:bg-line"
          >
            Open the topic
          </Link>
        ) : null}
        {authorId ? (
          <SmallButton
            onClick={() => {
              onGoToMember(authorId);
            }}
          >
            Go to {report.reportedAuthorName ?? 'them'}
          </SmallButton>
        ) : null}
        {settling ? null : (
          <SmallButton
            onClick={() => {
              setSettling(true);
            }}
          >
            Settle it
          </SmallButton>
        )}
      </div>

      {settling ? (
        <div className="mt-1">
          {/* Not "reason": what is being asked for is what was done about it,
              and it is what the next administrator to look at this person
              reads. "Resolved" on its own is refused by the database. */}
          <ReasonField
            id={`settle-${report.id}`}
            value={said}
            onChange={setSaid}
            label="What was decided (only administrators see this)"
            placeholder="Removed it and spoke to them"
          />
          <div className="mt-2 flex gap-1.5">
            {/* Required, and the button says so by being unavailable until
                there is a sentence. The database refuses a blank one either
                way — this only stops the round trip. */}
            <SmallButton disabled={!said.trim() || saving} onClick={settle}>
              {saving ? 'Saving…' : 'Settle it'}
            </SmallButton>
            <SmallButton
              onClick={() => {
                setSettling(false);
                setSaid('');
              }}
            >
              Not now
            </SmallButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Where it was said, who said it and when. The name is a link to the person;
 * the place is words, never a link — see the header.
 */
function Where({
  report,
  authors,
  onGoToMember,
}: {
  report: ChatReport;
  authors: Map<string, ChatAuthor>;
  onGoToMember: (memberId: string) => void;
}) {
  return (
    <p className="font-extrabold font-head text-[0.90625rem] text-ink leading-[1.35]">
      <MemberName
        id={report.reportedAuthorId}
        name={report.reportedAuthorName}
        gone="Former member"
        authors={authors}
        onGoToMember={onGoToMember}
      />
      <span className="ml-2 font-semibold text-[0.75rem] text-grey">
        {report.place} · {chatTimeLong(report.writtenAt)}
      </span>
    </p>
  );
}

/**
 * A member's name, as a way to them: their profile when they have one, their
 * row on this screen when they are hidden from Peers, and a plain word once
 * they have left the club. `authors` may not have arrived yet, in which case
 * the row is the safe destination — it exists for every member.
 */
function MemberName({
  id,
  name,
  gone,
  authors,
  onGoToMember,
}: {
  id: string | null;
  name: string | null;
  /** What to print when there is nobody left to name. */
  gone: string;
  authors: Map<string, ChatAuthor>;
  onGoToMember: (memberId: string) => void;
}) {
  if (!id) return <>{name ?? gone}</>;
  const label = name ?? gone;
  const style = 'underline decoration-line underline-offset-2 transition-colors hover:text-navy';
  if (authors.get(id)?.hasProfile) {
    return (
      <Link to={`/peers/${id}`} data-target="small" className={style}>
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-target="small"
      className={style}
      onClick={() => {
        onGoToMember(id);
      }}
    >
      {label}
    </button>
  );
}

/**
 * What the reporter saw, kept whatever has happened to the original since.
 *
 * The words are a copy. The photographs are not — no SQL can copy a file — so
 * they are the originals, readable here only because the report names them
 * (20260918200000), and gone from here if the sender has since deleted them.
 * The sentence under the grid says which of those it is, so an empty space is
 * never read as "there were no photographs".
 */
function Snapshot({ report }: { report: ChatReport }) {
  return (
    <div className="mt-1.5 border-line border-l-2 pl-2.5">
      {report.bodySnapshot ? (
        <p className="whitespace-pre-line text-[0.8125rem] text-ink leading-[1.5]">
          {report.bodySnapshot}
        </p>
      ) : null}
      {report.attachments.length > 0 ? (
        <div className="max-w-[20rem]">
          <AttachmentGrid
            paths={report.attachments}
            from={report.reportedAuthorName ?? 'a former member'}
          />
          <p className="mt-1 text-[0.71875rem] text-grey leading-[1.45]">
            {report.attachments.length === 1
              ? 'One photograph'
              : `${report.attachments.length} photographs`}{' '}
            were reported with it. Photographs are not copied: one that is missing here has since
            been deleted by whoever sent it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
