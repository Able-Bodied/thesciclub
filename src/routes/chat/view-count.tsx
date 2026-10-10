/** Missing counts are loading or unavailable, never invented zeroes. */
export function ViewCount({ count }: { count: number | null | undefined }) {
  return (
    <span className="font-semibold text-[0.78125rem] text-ink2">
      {count === undefined
        ? 'Views …'
        : count === null
          ? 'Views unavailable'
          : `${count} ${count === 1 ? 'view' : 'views'}`}
    </span>
  );
}
