/**
 * "Is this a question?", asked of whoever starts a topic (20261010010000).
 *
 * The owner's wording, 2026-10-09: ask them whether it is a question, and if
 * it is, make it stand out. A question is drawn large on Home; the switch says
 * so, so nobody is surprised by their own words on a coloured card.
 *
 * A native checkbox inside its label: the whole row is the target, and a
 * screen reader hears one control with its explanation.
 */
export function QuestionSwitch({
  checked,
  onChange,
  id = 'is-question',
  compact = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
  /** One line, for the quick box on Home and in a room: no card, no hint. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <label
        htmlFor={id}
        className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[0.875rem] text-ink"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          className="h-[1.15em] w-[1.15em] flex-none accent-emphasis"
        />
        <span>
          <span className="font-bold">This is a question</span>
          <span className="text-grey"> · shown larger on Home</span>
        </span>
      </label>
    );
  }
  return (
    <label
      htmlFor={id}
      className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 py-3 has-[:checked]:border-emphasis has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-emphasis has-[:focus-visible]:outline-offset-2"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        aria-describedby={`${id}-hint`}
        className="mt-[0.2em] h-[1.15em] w-[1.15em] flex-none accent-emphasis outline-none"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
          This is a question
        </span>
        <span id={`${id}-hint`} className="mt-0.5 block text-[0.8125rem] text-ink2 leading-[1.45]">
          Questions are shown larger on Home, so more people see them and answer.
        </span>
      </span>
    </label>
  );
}
