import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { useAccount } from '@/lib/account';
import { createGroup, GROUP_NAME_MAX, groupProblem } from '@/lib/chat/groups';
import { MemberPicker } from '@/routes/chat/member-picker';

/**
 * Starting a group: a name, and the members to put in it.
 *
 * ---------------------------------------------------------------------------
 * The name is required, and it is not generated from the members
 * ---------------------------------------------------------------------------
 * "Ada, Bo and 4 others" is what a messaging app writes when it has to name
 * something it was never told the name of, and it stops being true the moment
 * somebody joins. A group here is a thing with a purpose — Saturday ride, the
 * South Bay meet-ups — and the person starting it knows what that is.
 *
 * ---------------------------------------------------------------------------
 * The draft survives a refusal
 * ---------------------------------------------------------------------------
 * Same as the new topic screen. Nothing is cleared and the screen does not
 * navigate, because the likely refusals say something worth reading: somebody
 * picked has left the directory since the list was drawn, or the group is over
 * the cap.
 *
 * ---------------------------------------------------------------------------
 * There is no "add me" — the caller is always in it
 * ---------------------------------------------------------------------------
 * `chat_create_group` puts them on the roster without being named, so the
 * picker leaves them out of the list entirely rather than offering a tick that
 * cannot be cleared.
 */
export default function NewGroupPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const viewerId = account.status === 'member' ? account.userId : null;

  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problem = groupProblem(name, picked);

  function toggle(memberId: string) {
    setPicked((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  }

  function submit() {
    if (problem || saving) return;
    setSaving(true);
    setFailure(null);
    void createGroup(name, picked)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        // Straight into the group, replacing this screen: coming back to a
        // filled-in form for a group that now exists would invite a second one.
        void navigate(`/chat/t/${result.value}`, { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to="/chat" label="Chat" />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.02em]">
          New group
        </h1>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          Everybody you pick can read the whole conversation and can bring somebody else in. Anybody
          can leave. Nothing here is public, and no administrator can read it.
        </p>

        {failure ? (
          <p className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {failure} Nothing has been started, and what you chose is still here.
          </p>
        ) : null}

        <label
          htmlFor="group-name"
          className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
        >
          What is the group for?
        </label>
        <input
          id="group-name"
          value={name}
          maxLength={GROUP_NAME_MAX}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Saturday ride"
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-navy"
        />
        <p className="mt-1 text-[0.71875rem] text-grey">
          {GROUP_NAME_MAX - name.length} characters left. This is the name everybody in it sees.
        </p>

        <MemberPicker
          picked={picked}
          onToggle={toggle}
          exclude={new Set(viewerId ? [viewerId] : [])}
          label={picked.length === 0 ? 'Who is in it?' : `Who is in it? ${picked.length} picked`}
          emptyNote="There is nobody to add yet."
        />

        <button
          type="button"
          onClick={submit}
          disabled={Boolean(problem) || saving}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {saving ? 'Starting…' : 'Start the group'}
        </button>
        {/* The same value that disabled the button, said out loud. A disabled
            control with no explanation is a dead end. */}
        {problem ? (
          <p className="mt-1.5 text-center text-[0.71875rem] text-grey">{problem}</p>
        ) : null}
        <div className="h-3" />
      </div>
    </div>
  );
}
