/**
 * The club's logo, from the owner's brand files (sci-club-logo/, 2026-09-28).
 *
 * These draw the owner's SVGs as they are, from public/brand/, rather than
 * redrawing them here. Their README says not to recolour, stretch or
 * re-letter the logo, and a component that copies the paths is one edit away
 * from all three. The lettering is outlined in the files, so they draw the
 * same with or without Outfit loaded. To change the logo, replace the file in
 * public/brand/ from sci-club-logo/svg/.
 *
 * An <img> rather than inline SVG also keeps each file's gradient ids to
 * itself: the files use fixed ids ("key", "chrome"), and two copies inlined on
 * one page would draw with each other's fills.
 *
 * Before the rebrand these were hand-drawn SVG components lifted from the mock
 * in docs/index.html; see the git tag `brand-before-outfit`.
 */

/** The badge's own proportions: sci-club-badge.svg is 360 × 560. */
const BADGE_RATIO = 560 / 360;

/**
 * The full badge — the plate, the figure, THE SCI CLUB and the Members Only
 * button. `size` is the width; the README's minimum is 96px tall, which every
 * use here clears.
 */
export function ClubMark({ size = 88, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/sci-club-badge.svg"
      alt="The SCI Club"
      width={size}
      height={Math.round(size * BADGE_RATIO)}
      className={className}
      // Decoded before paint, so a profile does not open with a hole where the
      // badge goes.
      decoding="sync"
    />
  );
}

/**
 * The compact header lockup — the mark beside THE SCI CLUB. Reverse only,
 * because a navy header is the only place the app puts it; the plain one is
 * `sci-club-lockup-compact.svg` in the owner's folder if a light header ever
 * wants it. 32px is the README's minimum for the compact lockup.
 */
export function ClubWordmark() {
  return (
    <img
      src="/brand/sci-club-lockup-compact-reverse.svg"
      alt="The SCI Club"
      height={32}
      width={Math.round((32 * 480) / 140)}
      decoding="sync"
    />
  );
}
