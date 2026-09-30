import { chatTime } from '@/lib/chat/time';
import type { ChatEdit } from '@/lib/chat/types';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';

/**
 * What an edited post or message said before, for an administrator.
 *
 * A plain list under a disclosure: the words each version held, the
 * photographs it had then, and when it stopped being the current one. The
 * disclosure is the platform's own `<details>`, which opens on tap and on
 * Enter and needs no script; closed by default, because the current words
 * are what a topic is about and the history is for the one reader who may
 * have to act on it.
 *
 * Drawn for administrators only — `useEdits` hands everybody else nothing,
 * and the callers draw this only when there is something to show. Never a
 * count of zero: a post with no earlier versions has no disclosure.
 *
 * The photographs go through `AttachmentGrid` like any other. An edit does
 * not change them, so they are the post's own and readable wherever the post
 * is; on a report of a message they are readable because the report names
 * them (20260918200000).
 */
export function EarlierVersions({ edits, from }: { edits: ChatEdit[]; from: string }) {
  return (
    <details className="mt-1.5 text-[0.78125rem]">
      <summary
        data-target="small"
        className="inline-block cursor-pointer font-semibold text-grey underline decoration-line underline-offset-2 hover:text-navy"
      >
        Earlier versions
      </summary>
      <ol className="mt-1.5 border-line border-l-2 pl-2.5">
        {edits.map((edit) => (
          <li key={edit.id} className="mb-2 last:mb-0">
            {edit.body ? (
              <p className="whitespace-pre-line text-ink2 leading-[1.5]">{edit.body}</p>
            ) : null}
            {edit.attachments.length > 0 ? (
              <div className="max-w-[20rem]">
                <AttachmentGrid paths={edit.attachments} from={from} />
              </div>
            ) : null}
            <p className="mt-0.5 text-grey">Replaced {chatTime(edit.replacedAt)}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
