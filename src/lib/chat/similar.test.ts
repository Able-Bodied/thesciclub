import { describe, expect, it } from 'vitest';
import { questionWords, rankSimilar } from '@/lib/chat/similar';

const row = (id: string, title: string) => ({ id, room_id: 'bowel', title, reply_count: 2 });

describe('the words a question is matched on', () => {
  it('keeps the words that carry meaning, longest first, four at most', () => {
    expect(questionWords('What cushion do you use for long days in the chair?')).toEqual([
      'cushion',
      'chair',
      // Equal lengths keep the order they were typed in.
      'long',
      'days',
    ]);
  });

  it('drops the common words and the short ones, and says each word once', () => {
    expect(questionWords('Does anyone have tips? tips tips')).toEqual([]);
    expect(questionWords('Bowel bowel BOWEL')).toEqual(['bowel']);
  });

  it('keeps letters from any language, and nothing that could break a filter', () => {
    expect(questionWords('fauteuil, roulant*(),')).toEqual(['fauteuil', 'roulant']);
  });
});

describe('which topics are offered', () => {
  it('needs two shared words, or the only one there is', () => {
    const rows = [row('a', 'Best cushion for a power chair'), row('b', 'Chair repairs')];
    expect(rankSimilar(['cushion', 'chair'], rows).map((t) => t.id)).toEqual(['a']);
    expect(rankSimilar(['chair'], rows).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('puts the closest first, and offers three at most', () => {
    const rows = [
      row('one', 'cushion chair'),
      row('three', 'cushion chair long days'),
      row('two', 'cushion chair days'),
      row('also', 'cushion chair'),
    ];
    expect(rankSimilar(['cushion', 'chair', 'days', 'long'], rows).map((t) => t.id)).toEqual([
      'three',
      'two',
      'one',
    ]);
  });
});
