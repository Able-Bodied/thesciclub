/**
 * The club's logo: the owner's app icon (sci-club-logo/sci-club-app-icon.svg,
 * 2026-10-22), drawn from public/brand/ as it is rather than redrawn here.
 * An <img> rather than inline SVG keeps the file's gradient ids ("key",
 * "chrome") to itself. Before this the full badge was drawn; see the git tag
 * `brand-before-outfit`.
 */

import { cn } from '@/lib/utils';

/**
 * The icon as a rounded square: the SVG fills its square, and the 22% corner
 * is the one home screens use. `size` is the width and the height.
 */
export function ClubMark({ size = 88, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/sci-club-app-icon.svg"
      alt="The SCI Club"
      width={size}
      height={size}
      className={cn('rounded-[22%]', className)}
      // Decoded before paint, so a profile does not open with a hole where the
      // icon goes.
      decoding="sync"
    />
  );
}
