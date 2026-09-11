import { ShieldCheck } from 'lucide-react';

/**
 * The number verified, and it is not on the list.
 *
 * Written as a closed door rather than as an error, because it is one. It names
 * the organizations who can open it, so somebody who wants in knows exactly
 * what to do next — a dead end with no route out of it is the thing that makes
 * an invite-only product feel like a snub rather than a club.
 */

const VOUCHERS = [
  ['NCS', 'NorCal SCI', 'Runs the peer mentor programme most members came through.'],
  ['SC', 'SCVMC SCI Peer Support', 'Weekly, including bedside visits on the rehab unit.'],
  ['WWM', 'Wheel with Me Foundation', 'Grants and adaptive sport programming.'],
] as const;

export function BlockedScreen({ onTryAnother }: { onTryAnother: () => void }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto px-[18px] pt-12">
        <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-gold-lt text-gold-dp">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-extrabold font-head text-[1.5625rem] text-ink leading-tight tracking-[-0.02em]">
          This number isn't on the list
        </h1>
        <p className="mt-2.5 text-[0.8875rem] text-ink2 leading-[1.52]">
          The club is closed. A member organization or a peer mentor has to add your number before
          you can join — the app itself cannot let you in.
        </p>

        <div className="mt-4 rounded-[17px] border border-line bg-paper px-3.5">
          {VOUCHERS.map(([code, name, blurb]) => (
            <div key={code} className="flex gap-3 border-line border-b py-3.5 last:border-b-0">
              <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[10px] bg-gradient-to-br from-gold-dp to-gold font-extrabold font-head text-[0.59375rem] text-white">
                {code}
              </span>
              <span>
                <span className="block font-extrabold font-head text-[0.875rem]">{name}</span>
                <span className="mt-0.5 block text-[0.78125rem] text-grey leading-[1.42]">
                  {blurb}
                </span>
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[0.78125rem] text-grey leading-[1.5]">
          If a member gave you a QR code, it gets you the app — it does not get you in. Someone
          still has to add your number.
        </p>
      </div>

      <footer className="flex-none px-[18px] pt-3 pb-[max(22px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onTryAnother}
          className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem]"
        >
          Try another number
        </button>
      </footer>
    </div>
  );
}
