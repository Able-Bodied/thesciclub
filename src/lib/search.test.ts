import { describe, expect, it } from 'vitest';
import { matchesSearch, searchWords } from '@/lib/search';

describe('search matches the start of a word (the owner, 2026-11-06)', () => {
  it('finds Ran and Randy for "ran", not Pranav or Grant', () => {
    expect(matchesSearch('Ran', 'ran')).toBe(true);
    expect(matchesSearch('Randy Lee', 'Ran')).toBe(true);
    expect(matchesSearch('Pranav Parakh', 'ran')).toBe(false);
    expect(matchesSearch('Grant fund', 'ran')).toBe(false);
  });

  it('needs every typed word, in any order', () => {
    expect(matchesSearch('Adaptive yoga in Oakland', 'oak yog')).toBe(true);
    expect(matchesSearch('Adaptive yoga in Oakland', 'oak swim')).toBe(false);
  });

  it('starts a word after punctuation, and ignores a leading @ or #', () => {
    expect(matchesSearch(['Pranav Parakh', 'pranav.parakh'], 'parakh')).toBe(true);
    expect(matchesSearch('pranav.parakh', 'pranav.par')).toBe(true);
    expect(matchesSearch('Mary-Ann', 'ann')).toBe(true);
    expect(matchesSearch(['Bo', 'bo_lee'], '@bo')).toBe(true);
    expect(matchesSearch('Weekend Crew', '#week')).toBe(true);
  });

  it('ignores case, accents and an apostrophe', () => {
    expect(matchesSearch('José Núñez', 'jose nun')).toBe(true);
    expect(matchesSearch("Liam O'Brien", 'obrien')).toBe(true);
    expect(matchesSearch("Liam O'Brien", 'brien')).toBe(true);
  });

  it('is every row for no search, and skips missing parts', () => {
    expect(matchesSearch('anything', '   ')).toBe(true);
    expect(matchesSearch([null, undefined, 'Berkeley'], 'berk')).toBe(true);
    expect(searchWords('  @Ran  #Two ')).toEqual(['ran', 'two']);
  });
});
