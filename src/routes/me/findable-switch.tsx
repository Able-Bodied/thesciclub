import { useFindableForInvites } from '@/lib/invite-request';

/**
 * "People who have my number can ask me for an invite" (20261011000000), for
 * a member who can invite. On unless they turn it off (the owner's choice).
 *
 * Off, somebody at the closed door who has their number is told nothing about
 * them: not that they are in the club, nor that they could help.
 */
export function FindableSwitch({ userId }: { userId: string }) {
  const { findable, saving, error, set } = useFindableForInvites(userId);
  if (findable === null) return null;
  return (
    <div className="rounded-[14px] border border-line bg-paper p-3.5">
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={findable}
          disabled={saving}
          onChange={(event) => {
            set(event.target.checked);
          }}
          aria-describedby="findable-hint"
          className="mt-[0.2em] h-[1.15em] w-[1.15em] flex-none accent-emphasis"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold font-head text-[0.9375rem] text-ink">
            Let people who have my number ask me for an invite
          </span>
          <span
            id="findable-hint"
            className="mt-0.5 block text-[0.8125rem] text-ink2 leading-[1.45]"
          >
            Somebody not yet on the list who already has your number can see that you can add them,
            and text you. Off, they learn nothing about you.
          </span>
        </span>
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
