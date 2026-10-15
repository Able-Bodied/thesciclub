import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * A QR code, drawn here as one SVG path: no image, no network, nothing for the
 * CSP to allow. Black on white with the four-module quiet zone the standard
 * asks for, whatever the theme, because a phone's camera reads that best.
 *
 * Error correction M: a code shown on a screen across a table is clean, and
 * a lower level keeps the modules larger for the same width.
 */

/** The path of every dark module, offset by the quiet zone. */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return { size: count + quiet * 2, path };
}

export function QrCode({
  text,
  label,
  className,
}: {
  text: string;
  /** What a screen reader says: what the code opens, not "QR code". */
  label: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => qrPath(text), [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('block h-auto w-full', className)}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
