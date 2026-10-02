import { type RefObject, useEffect } from 'react';

/**
 * Where focus goes while a sheet is open: in, round, and back.
 *
 * - **In.** On open, focus moves to the sheet's title, so a screen reader says
 *   which sheet this is and the next Tab is its first control. The title wants
 *   `tabIndex={-1}`: focusable from here, not a stop in the Tab order.
 * - **Round.** Tab and Shift+Tab go round the sheet's own controls and never
 *   reach the page behind it, which `aria-modal` has already told a screen
 *   reader is out of reach. Shift+Tab from the title is the last control.
 * - **Back.** On close, focus goes back to whatever had it when the sheet
 *   opened, if that is still on the page. Done here, on unmount, rather than
 *   by each screen holding a ref to its button: several screens open sheets,
 *   and a rule each has to remember is a rule one of them forgets.
 *
 * Escape closes. The listener is on the window, so focus that has somehow
 * left the sheet is still caught, and the next Tab brings it back.
 *
 * Every sheet and dialog in the app uses it: the filter shell, the report
 * sheet, the likes list and the photograph viewer (whose picture is its
 * title, and whose arrow keys are its own).
 */
export function useDialogFocus(
  dialog: RefObject<HTMLElement | null>,
  title: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    // Read before anything moves it: this is what opened the sheet.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    title.current?.focus();
    return () => {
      // Only if it is still on the page. A sheet closed by leaving the screen
      // has nothing to go back to.
      if (opener?.isConnected) opener.focus();
    };
  }, [title]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'Tab') keepFocusInside(event);
    }
    function keepFocusInside(event: KeyboardEvent) {
      const root = dialog.current;
      if (!root) return;
      // Not a disabled control, and not one that is `hidden` (a panel's Close
      // on a phone): neither can take focus, and the loop would end on nothing.
      const controls = [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled])',
        ),
      ].filter(
        (control) =>
          control.getAttribute('tabindex') !== '-1' && getComputedStyle(control).display !== 'none',
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      const at = controls.findIndex((control) => control === document.activeElement);
      if (event.shiftKey && at <= 0) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (at === controls.length - 1 || !root.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [dialog, onClose]);
}
