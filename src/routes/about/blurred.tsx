/**
 * What About us blurs (the owner, 2026-11-15: "Blur out the city, age, injury
 * month/date"). The database never sends those (about_us_team,
 * 20261115150000), so what is blurred is a stand-in, the same for everybody,
 * and there is nothing real in the page to unblur.
 */

export const STAND_IN_AGE = '35';
export const STAND_IN_PLACE = 'Sacramento, CA';
export const STAND_IN_DAY = 'June 15';
export const STAND_IN_MONTH = 'June';

/** Shown blurred; a screen reader hears that it is hidden, not the stand-in. */
export function Blurred({ children }: { children: string }) {
  return (
    <>
      <span aria-hidden="true" className="select-none blur-[5px]">
        {children}
      </span>
      <span className="sr-only">hidden</span>
    </>
  );
}

/** "Injured ▒▒▒ 2019": the month and day blurred, as precise as was given. */
export function InjuredIn({ year, precision }: { year: number | null; precision: string | null }) {
  if (!year) return null;
  return (
    <>
      Injured{' '}
      {precision === 'day' || precision === 'month' ? (
        <>
          <Blurred>{precision === 'day' ? STAND_IN_DAY : STAND_IN_MONTH}</Blurred>{' '}
        </>
      ) : null}
      {year}
    </>
  );
}
