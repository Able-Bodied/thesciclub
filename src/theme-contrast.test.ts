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
    ['--gold-dp on --gold-lt (the "Online" badge)', 'gold-dp', 'gold-lt'],
    ['--navy on --tint (tag pills)', 'navy', 'tint'],
    ['--navy on --paper (links and buttons)', 'navy', 'paper'],
    // The hover states are pairs that meet on a screen too, and a hover colour
    // chosen by eye is exactly where a palette quietly drops under AA.
    ['white on --navy-hi (a primary under the pointer)', 'paper', 'navy-hi'],
    ['--navy on --line (a tint button under the pointer)', 'navy', 'line'],
  ])('%s clears AA', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(AA);
  });

  it('keeps the gold primary readable under the pointer', () => {
    // #2A1E06 is written into the button rather than held as a token, so it is
    // named here rather than read from the CSS.
    expect(contrast('#2A1E06', token('gold-hi'))).toBeGreaterThanOrEqual(AA);
  });
});
