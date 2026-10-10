import { useEffect, useState } from 'react';
import type { Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * Questions already asked that look like the one being typed (the owner,
 * 2026-10-10), so somebody finds an answer before asking twice.
 *
 * Plain word matching on topic titles, not search: the words that carry
 * meaning (four letters or more, not the common ones) are looked for in the
 * titles a member can read (the topics' own read policy decides which), and
 * a topic is offered when it shares at least two of them, or the only one
 * there is. Newest activity first among equals. Three at most.
 */
export interface SimilarTopic {
  id: string;
  roomId: string;
  title: string;
  replyCount: number;
}

const COMMON = new Set([
  'about',
  'after',
  'again',
  'also',
  'anybody',
  'anyone',
  'been',
  'being',
  'best',
  'could',
  'does',
  'doing',
  'done',
  'each',
  'even',
  'ever',
  'from',
  'getting',
  'good',
  'have',
  'having',
  'help',
  'here',
  'into',
  'just',
  'know',
  'like',
  'make',
  'many',
  'more',
  'most',
  'much',
  'need',
  'only',
  'other',
  'over',
  'people',
  'really',
  'should',
  'some',
  'something',
  'still',
  'such',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'thing',
  'things',
  'think',
  'this',
  'those',
  'through',
  'want',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
  'yours',
  'anything',
  'everyone',
  'somebody',
  'someone',
  'tips',
  'advice',
  'question',
  'guys',
  'recommend',
  'recommendations',
  'there',
  'thanks',
]);

/** The words worth matching on, longest first, four at most. */
export function questionWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && !COMMON.has(word));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 4);
}

interface Row {
  id: string;
  room_id: string;
  title: string;
  reply_count: number;
}

/** Which of the candidates to offer, best first. Pure, for its test. */
export function rankSimilar(words: readonly string[], rows: readonly Row[]): SimilarTopic[] {
  if (words.length === 0) return [];
  const needed = Math.min(2, words.length);
  return rows
    .map((row) => {
      const title = row.title.toLowerCase();
      return { row, score: words.filter((word) => title.includes(word)).length };
    })
    .filter(({ score }) => score >= needed)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ row }) => ({
      id: row.id,
      roomId: row.room_id,
      title: row.title,
      replyCount: row.reply_count,
    }));
}

async function findSimilar(words: string[], signal: AbortSignal): Promise<SimilarTopic[]> {
  const { data, error } = (await getSupabase()
    .from('chat_topics')
    .select('id, room_id, title, reply_count')
    // Letters and digits only, so nothing in a word can break the filter.
    .or(words.map((word) => `title.ilike.*${word}*`).join(','))
    .order('last_post_at', { ascending: false })
    .limit(30)
    .abortSignal(signal)) as { data: Row[] | null; error: Failure | null };
  if (error) return [];
  return rankSimilar(words, data ?? []);
}

/** The similar topics for what is typed, looked up a moment after typing stops. */
export function useSimilarTopics(text: string): SimilarTopic[] {
  const [found, setFound] = useState<SimilarTopic[]>([]);
  const key = questionWords(text).join(' ');

  useEffect(() => {
    const words = key ? key.split(' ') : [];
    if (words.length === 0) {
      setFound([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findSimilar(words, controller.signal)
        .then((topics) => {
          if (!controller.signal.aborted) setFound(topics);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return found;
}
