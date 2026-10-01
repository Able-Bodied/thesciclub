import { useEffect, useRef } from 'react';

/**
 * Report, or the word "Reported" once a report has gone.
 *
 * Drawn under a post, beside a message and under a line about a change to a
 * group. One component because of what happens to focus between the two.
 *
 * ---------------------------------------------------------------------------
 * Focus lands on "Reported"
 * ---------------------------------------------------------------------------
 * The report sheet gives focus back to Report when it closes. After a report
 * is sent the screen reads the reports again and Report is replaced by
 * "Reported" — and focus on a button that is taken off the page falls to the
 * top of it, so a member on a keyboard or a screen reader who has just
 * reported something is dropped at the start of the screen with nothing said.
 *
 * So "Reported" can hold focus (`tabIndex={-1}`, not a stop in the Tab order)
 * and takes it when it replaces a Report that was pressed here, and only when
 * focus has fallen to the page. Read out, it is the confirmation. It never
 * takes focus when a screen opens on something already reported.
 *
 * Not a disabled button. A disabled control is read out as one and invites a
 * second try; this is a statement of what has happened.
 */
export function ReportControl({
  reported,
  label,
  onReport,
  buttonClassName,
  noteClassName,
}: {
  reported: boolean;
  /** Named for what it reports — "Report Jan's post" — as every control on a post is. */
  label: string;
  onReport: () => void;
  buttonClassName: string;
  noteClassName: string;
}) {
  const note = useRef<HTMLParagraphElement | null>(null);
  // Pressed here, and not yet answered by "Reported".
  const pressed = useRef(false);

  useEffect(() => {
    if (!reported || !pressed.current) return;
    pressed.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body) note.current?.focus();
  }, [reported]);

  if (reported) {
    return (
      <p ref={note} tabIndex={-1} className={noteClassName}>
        Reported
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        pressed.current = true;
        onReport();
      }}
      aria-label={label}
      data-target="small"
      className={buttonClassName}
    >
      Report
    </button>
  );
}
