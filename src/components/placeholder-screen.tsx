/**
 * The shared body for a tab that exists in the bar but is not built yet.
 *
 * It says so plainly rather than faking content. A screen that looks finished
 * and does nothing costs more than an empty one: it gets demoed, believed, and
 * then explained.
 */
export function PlaceholderScreen({
  title,
  blurb,
  note,
}: {
  title: string;
  blurb: string;
  note: string;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <h1 className="font-extrabold font-head text-[1.5625rem] text-ink">{title}</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <p className="text-[0.90625rem] text-ink2 leading-relaxed">{blurb}</p>
        <p className="text-[0.78125rem] text-grey leading-relaxed">{note}</p>
      </div>
    </div>
  );
}
