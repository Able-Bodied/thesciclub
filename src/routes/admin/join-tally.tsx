import type { TallyRow } from '@/routes/admin/members-admin';

/**
 * Who joined while anybody could join, by event and by administrator (the
 * owner, 2026-10-14), so an event's booth can be judged afterwards. Counted
 * from the list below by joinTally; drawn only when there is something to
 * count.
 */
export function JoinTally({ rows }: { rows: TallyRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="join-tally-heading">
      <div className="mt-4 flex items-center justify-between gap-2">
        <h2
          id="join-tally-heading"
          className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
        >
          Joined while open
        </h2>
      </div>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        Everybody who joined without an invite, by the event and administrator whose QR code they
        scanned. Events count by their name exactly as typed.
      </p>
      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
        <table className="w-full border-collapse text-left text-[0.8125rem]">
          <thead>
            <tr className="border-line border-b text-[0.75rem] text-grey">
              <th scope="col" className="p-3 font-semibold">
                Event
              </th>
              <th scope="col" className="p-3 text-right font-semibold">
                Joined
              </th>
              <th scope="col" className="p-3 font-semibold">
                By administrator
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-line border-b align-top last:border-b-0">
                <th scope="row" className="break-words p-3 font-bold text-ink">
                  {row.label}
                </th>
                <td className="p-3 text-right font-bold text-ink tabular-nums">{row.joined}</td>
                <td className="break-words p-3 text-ink2">
                  {row.byAdmin.length === 0
                    ? '—'
                    : row.byAdmin.map((a) => `${a.name} ${a.joined}`).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
