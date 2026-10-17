import { cn } from '@/lib/utils';

/**
 * What a list shows while it is read: grey cards the size of the real ones,
 * rather than a line of text and then the whole list at once. The words are
 * still there for a screen reader, in the same status region, and the cards
 * are hidden from it. The pulse stops for anybody who asked for less motion
 * (the reduced-motion block in index.css).
 */
export function LoadingCards({
  label,
  count = 3,
  height,
  rows = false,
  className,
}: {
  /** What is being read, as a screen reader hears it: "Loading members…". */
  label: string;
  count?: number;
  /** About the height of one real card, in pixels. */
  height: number;
  /** Rows in one bordered list (conversations) rather than separate cards. */
  rows?: boolean;
  className?: string;
}) {
  const placeholders = Array.from({ length: count }, (_, index) => (
    <div
      // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders with no identity.
      key={index}
      aria-hidden="true"
      className={cn(
        'flex animate-pulse flex-col justify-center gap-2.5',
        rows
          ? 'border-line border-b px-0.5 last:border-b-0'
          : 'rounded-[14px] border border-line bg-paper p-4',
      )}
      style={{ minHeight: height }}
    >
      <div className="h-3 w-1/3 rounded-full bg-tint" />
      <div className="h-3.5 w-4/5 rounded-full bg-tint" />
      {height > 90 ? <div className="h-3 w-3/5 rounded-full bg-tint" /> : null}
    </div>
  ));
  return (
    <div role="status" className={cn(rows ? '' : 'flex flex-col gap-3', className)}>
      <span className="sr-only">{label}</span>
      {rows ? (
        <div className="rounded-[14px] border border-line bg-paper px-3.5">{placeholders}</div>
      ) : (
        placeholders
      )}
    </div>
  );
}
