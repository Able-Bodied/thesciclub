import { useAttachmentUrls } from '@/lib/chat/attachments';
import { noticeText } from '@/lib/chat/threads';
import { chatTime } from '@/lib/chat/time';
import type { ChatMessage, ChatNotice } from '@/lib/chat/types';

/**
 * A line in a group's conversation that records a change to the group:
 * "Jan renamed the group to “Tuesday swimmers”".
 *
 * ---------------------------------------------------------------------------
 * Not a bubble
 * ---------------------------------------------------------------------------
 * Nobody said it, so it is not drawn as something said: centred, small, grey,
 * between the bubbles in time order. There is no Reply (nothing to answer), no
 * Edit and no Remove — the database refuses all three for a notice, because
 * the line is the trace the owner asked for on 2026-09-30, and a trace its
 * author could take back is not one.
 *
 * ---------------------------------------------------------------------------
 * But it can be reported
 * ---------------------------------------------------------------------------
 * A hostile name or picture is something done to everybody in the group, and
 * the line is where it is reportable, like any message. The report carries
 * the sentence and, for a picture, the picture itself — `chat_report_message`
 * words it for the administrators (20260930020000).
 *
 * A new picture is shown small beside the words, so the line says what it
 * changed to without the reader having to look up at the header.
 */
export function NoticeLine({
  message,
  notice,
  who,
  canReport,
  reported,
  onReport,
}: {
  message: ChatMessage;
  notice: ChatNotice;
  /** "You", the member's name, or "A former member". */
  who: string;
  canReport: boolean;
  reported: boolean;
  onReport: () => void;
}) {
  const urls = useAttachmentUrls(
    notice === 'pictured' && message.removedAt === null ? message.attachments : [],
  );
  const picture = message.attachments[0] ? urls.get(message.attachments[0]) : undefined;

  return (
    <div
      id={`message-${message.id}`}
      className="my-2.5 flex flex-col items-center gap-1 px-4 text-center"
    >
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.75rem] text-grey leading-[1.45]">
        {picture ? (
          // Decorative: the words say what happened, and the header shows it.
          <img
            src={picture}
            alt=""
            className="h-[2em] w-[2em] flex-none rounded-[0.5em] object-cover"
          />
        ) : null}
        <span>
          {message.removedAt !== null
            ? 'A line about a change to the group was removed by an administrator.'
            : noticeText(notice, who, message.body)}
          <span aria-hidden="true"> · </span>
          <span className="whitespace-nowrap">{chatTime(message.createdAt)}</span>
        </span>
      </p>
      {canReport && message.removedAt === null ? (
        reported ? (
          <p className="font-semibold text-[0.71875rem] text-grey">Reported</p>
        ) : (
          <button
            type="button"
            onClick={onReport}
            aria-label={`Report ${who}’s change to the group`}
            data-target="small"
            className="min-h-[1.75rem] font-semibold text-[0.71875rem] text-grey underline decoration-line underline-offset-2 hover:text-destructive"
          >
            Report
          </button>
        )
      ) : null}
    </div>
  );
}
