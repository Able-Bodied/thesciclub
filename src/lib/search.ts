/**
 * How every search box matches (the owner, 2026-11-06): what is typed finds
 * the start of a word, as most search does. "ran" finds Ran and Randy, and
 * not Pranav or Grant. Each typed word has to start some word, in any order;
 * case and accents don't count, and punctuation starts a new word, so
 * "parakh" finds pranav.parakh and "ann" finds Mary-Ann. A leading @ or # is
 * ignored. Peers searched this way first (peers/filters.ts).
 */

/** Lowercase, without accents: "José" reads as "jose". */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase();
}

/** What was typed, as the words it matches on. Empty is no search. */
export function searchWords(query: string): string[] {
  return foldForSearch(query)
    .split(/\s+/)
    .map((word) => word.replace(/^[@#]+/, ''))
    .filter(Boolean);
}

/** Whether `word` begins a word somewhere in `text`. Both already folded. */
export function beginsAWord(text: string, word: string): boolean {
  let at = text.indexOf(word);
  while (at !== -1) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1] ?? '')) return true;
    at = text.indexOf(word, at + 1);
  }
  return false;
}

type Texts = string | null | undefined | readonly (string | null | undefined)[];

/** Whether every typed word begins a word of the text. True for no search. */
export function matchesSearch(texts: Texts, query: string | readonly string[]): boolean {
  const words = typeof query === 'string' ? searchWords(query) : query;
  if (words.length === 0) return true;
  const parts = typeof texts === 'string' || texts == null ? [texts] : texts;
  const text = foldForSearch(parts.filter(Boolean).join(' '));
  // "obrien" for O'Brien: the apostrophe dropped as well as kept.
  const joined = text.replace(/['’]/g, '');
  return words.every((word) => beginsAWord(text, word) || beginsAWord(joined, word));
}
