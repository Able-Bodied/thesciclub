import { Link } from 'react-router-dom';
import { useSimilarTopics } from '@/lib/chat/similar';

/**
 * "Already asked": up to three topics whose titles share the words being
 * typed. Under the box, quiet, and never in the way: each opens the topic,
 * and nothing stops the member posting their own anyway.
 */
export function SimilarTopics({ text, linkState }: { text: string; linkState?: unknown }) {
  const similar = useSimilarTopics(text);
  if (similar.length === 0) return null;
  return (
    <div className="mt-2 rounded-[12px] bg-tint px-3 py-2.5">
      <p
        id="similar-heading"
        className="font-bold text-[0.75rem] text-ink2 uppercase tracking-[0.08em]"
      >
        Already asked
      </p>
      <ul aria-labelledby="similar-heading" className="mt-1">
        {similar.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
              state={linkState}
              className="flex min-h-[44px] items-center gap-2 py-1 text-[0.875rem] text-emphasis underline-offset-2 hover:underline"
            >
              <span className="min-w-0 flex-1 font-semibold">{topic.title}</span>
              <span className="flex-none text-[0.75rem] text-grey">
                {topic.replyCount === 0
                  ? 'No replies yet'
                  : `${topic.replyCount} ${topic.replyCount === 1 ? 'reply' : 'replies'}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
