import { describe, expect, it } from 'vitest';
import CSS from './index.css?raw';

/**
 * The palette has to stay readable.
 *
 * These are the pairs that actually meet on a screen, not every combination
 * the tokens allow. Two of them were under AA and were found by measuring
 * rather than by looking: --grey on white was 3.60:1, and it is the token the
 * time and place of an event are drawn in; --gold-dp on --gold-lt was 4.47:1
 * on the "Online" badge. Both look fine to a good pair of eyes, which is why
 * this is a test and not a review note.
 *
 * The ratios are read from src/index.css rather than restated here, so a token
 * edit is what this catches — a copy of the hex in this file would pass while
 * the app regressed.
 */

function token(name: string): string {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})`, 'i').exec(CSS);
  const hex = found?.[1];
  if (!hex) throw new Error(`--${name} is not declared in src/index.css`);
  return hex;
}

/** The body of the first rule whose selector is exactly `selector`. */
function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} is not in src/index.css`);
  const end = CSS.indexOf('}', start);
  return CSS.slice(start + selector.length + 2, end);
}

const DARK = block(':root[data-appearance="dark"]');
const DARK_BY_DEVICE = block(':root:not([data-appearance="light"])');

/**
 * A token's dark value: the dark block's own, or the light value where the dark
 * block leaves it alone (the brand's fixed colours — navy, gold, on-gold).
 */
function darkToken(name: string): string {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})`, 'i').exec(DARK);
  return found?.[1] ?? token(name);
}

/** One #rrggbb channel as a 0-1 number, expanding #rgb on the way. */
function channels(hex: string): [number, number, number] {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  const parsed = (full.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16) / 255);
  const [r, g, b] = parsed;
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`${hex} is not a six-digit colour`);
  }
  return [r, g, b];
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for body text. Everything below is drawn well under 18pt. */
const AA = 4.5;

describe('palette contrast', () => {
  it.each([
    ['--grey on --paper (event card time and place)', 'grey', 'paper'],
    ['--ink2 on --paper (card meta line)', 'ink2', 'paper'],
    ['--ink on --paper (body copy)', 'ink', 'paper'],
    ['--grey on --canvas (secondary copy on the page ground)', 'grey', 'canvas'],
    // gold-800 on the pale gold is the tightest pair in the palette at 4.55:1.
    ['--gold-dp on --gold-lt (the "Online" badge)', 'gold-dp', 'gold-lt'],
    ['--ink2 on --gold-lt (the note in Home’s filter sheet)', 'ink2', 'gold-lt'],
    ['--gold-dp on --paper (gold words on a card)', 'gold-dp', 'paper'],
    ['--gold-dp on --canvas (the welcome headline)', 'gold-dp', 'canvas'],
    // The brand pairs gold fills with navy ink, not white — white on --gold is
    // 2.2:1, which is why no button or tag draws it.
    ['--on-gold on --gold (every gold button and tag)', 'on-gold', 'gold'],
    ['--on-gold on --gold-hi (a gold button under the pointer)', 'on-gold', 'gold-hi'],
    ['--gold-hi on --navy (gold words on a navy header)', 'gold-hi', 'navy'],
    ['--navy on --tint (tag pills)', 'navy', 'tint'],
    ['--navy on --paper (links and buttons)', 'navy', 'paper'],
    // The hover states are pairs that meet on a screen too, and a hover colour
    // chosen by eye is exactly where a palette quietly drops under AA.
    ['white on --navy-hi (a primary under the pointer)', 'paper', 'navy-hi'],
    ['--navy on --line (a tint button under the pointer)', 'navy', 'line'],
    // The roles navy was split into for the dark theme. In light they are the
    // navy they replaced, and have to stay as readable as it was.
    ['--emphasis on --paper (links and outline buttons)', 'emphasis', 'paper'],
    ['--emphasis on --tint (tag pills)', 'emphasis', 'tint'],
    ['white on --action (a filled button)', 'paper', 'action'],
    ['white on --action-hi (a filled button under the pointer)', 'paper', 'action-hi'],
    ['--gold-ink on --gold-lt (a pale gold note)', 'gold-ink', 'gold-lt'],
    ['--danger-ink on --danger-lt (the Cancelled badge)', 'danger-ink', 'danger-lt'],
    ['white on --destructive-fill (Delete my account)', 'paper', 'destructive-fill'],
    // The six discussion-room categories, on both grounds a room card is
    // drawn on: --paper for the card itself and --canvas for the page behind
    // it, where the category label sits. --room-life is the tight one — 5.21:1
    // on paper and 4.81:1 on canvas — and it is the same hex that was already
    // caught once at 4.47:1 against --gold-lt.
    ['--room-body on --paper (a Body room card)', 'room-body', 'paper'],
    ['--room-body on --canvas (the Body category label)', 'room-body', 'canvas'],
    ['--room-mind on --paper (a Mind room card)', 'room-mind', 'paper'],
    ['--room-mind on --canvas (the Mind category label)', 'room-mind', 'canvas'],
    ['--room-life on --paper (a Life room card)', 'room-life', 'paper'],
    ['--room-life on --canvas (the Life category label)', 'room-life', 'canvas'],
    ['--room-family on --paper (a Family room card)', 'room-family', 'paper'],
    ['--room-family on --canvas (the Family category label)', 'room-family', 'canvas'],
    ['--room-kit on --paper (a Kit room card)', 'room-kit', 'paper'],
    ['--room-kit on --canvas (the Kit category label)', 'room-kit', 'canvas'],
    ['--room-places on --paper (a Places room card)', 'room-places', 'paper'],
    ['--room-places on --canvas (the Places category label)', 'room-places', 'canvas'],
  ])('%s clears AA', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(AA);
  });
});

/*
 * The dark theme (Me → Display → Appearance), the brand's Navy theme. The pairs
 * are the light ones in their dark roles: links, outlines and eyebrows are
 * --emphasis, filled buttons are --action, and words on a pale note are
 * --gold-ink. A pair that only exists in light (gold-dp on canvas is the
 * welcome headline, also drawn in dark) is kept, since the screen is the same.
 */
describe('dark palette contrast', () => {
  it.each([
    ['--ink on --paper (body copy)', 'ink', 'paper'],
    ['--ink on --canvas (page titles)', 'ink', 'canvas'],
    ['--ink2 on --paper (card meta line)', 'ink2', 'paper'],
    ['--ink2 on --canvas', 'ink2', 'canvas'],
    ['--ink2 on --tint (an unselected pill)', 'ink2', 'tint'],
    ['--grey on --paper (event card time and place)', 'grey', 'paper'],
    ['--grey on --canvas (secondary copy on the page ground)', 'grey', 'canvas'],
    ['--grey on --tint', 'grey', 'tint'],
    ['--emphasis on --paper (links and outline buttons)', 'emphasis', 'paper'],
    ['--emphasis on --canvas (back links, eyebrows)', 'emphasis', 'canvas'],
    ['--emphasis on --tint (tag pills)', 'emphasis', 'tint'],
    ['--emphasis on --line (a tint button under the pointer)', 'emphasis', 'line'],
    ['--ink2 on --line (an unselected pill under the pointer)', 'ink2', 'line'],
    ['white on --action (a filled button)', 'ink', 'action'],
    ['white on --action-hi (a filled button under the pointer)', 'ink', 'action-hi'],
    ['--gold-dp on --gold-lt (the "Online" badge)', 'gold-dp', 'gold-lt'],
    ['--gold-dp on --paper (gold words on a card)', 'gold-dp', 'paper'],
    ['--gold-dp on --canvas (the welcome headline)', 'gold-dp', 'canvas'],
    ['--ink2 on --gold-lt (the note in Home’s filter sheet)', 'ink2', 'gold-lt'],
    ['--gold-ink on --gold-lt (a pale gold note)', 'gold-ink', 'gold-lt'],
    ['--on-gold on --gold (every gold button and tag)', 'on-gold', 'gold'],
    ['--gold-hi on --navy (gold words on a navy header)', 'gold-hi', 'navy'],
    ['--destructive on --paper (an error under a field)', 'destructive', 'paper'],
    ['--destructive on --canvas', 'destructive', 'canvas'],
    ['--danger-ink on --danger-lt (the Cancelled badge)', 'danger-ink', 'danger-lt'],
    ['white on --destructive-fill (Delete my account)', 'ink', 'destructive-fill'],
    ['--room-body on --paper', 'room-body', 'paper'],
    ['--room-body on --canvas', 'room-body', 'canvas'],
    ['--room-mind on --paper', 'room-mind', 'paper'],
    ['--room-mind on --canvas', 'room-mind', 'canvas'],
    ['--room-life on --paper', 'room-life', 'paper'],
    ['--room-life on --canvas', 'room-life', 'canvas'],
    ['--room-family on --paper', 'room-family', 'paper'],
    ['--room-family on --canvas', 'room-family', 'canvas'],
    ['--room-kit on --paper', 'room-kit', 'paper'],
    ['--room-kit on --canvas', 'room-kit', 'canvas'],
    ['--room-places on --paper', 'room-places', 'paper'],
    ['--room-places on --canvas', 'room-places', 'canvas'],
  ])('%s clears AA', (_label, fg, bg) => {
    expect(contrast(darkToken(fg), darkToken(bg))).toBeGreaterThanOrEqual(AA);
  });

  // An unread dot and a progress bar carry meaning with no words, so they need
  // the 3:1 WCAG asks of graphics, on the page and on a card.
  it.each([
    ['--emphasis dot on --canvas', 'emphasis', 'canvas'],
    ['--emphasis dot on --paper', 'emphasis', 'paper'],
  ])('%s clears 3:1', (_label, fg, bg) => {
    expect(contrast(darkToken(fg), darkToken(bg))).toBeGreaterThanOrEqual(3);
  });

  // Written twice in index.css — once for Dark, once for Match my phone on a
  // dark phone — because CSS cannot share one block between the two. A value
  // changed in one and not the other would make the two settings disagree.
  it('is the same whether chosen or taken from the phone', () => {
    const declarations = (body: string) =>
      body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .sort();
    expect(declarations(DARK_BY_DEVICE)).toEqual(declarations(DARK));
  });
});
