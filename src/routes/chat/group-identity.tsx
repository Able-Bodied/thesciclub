import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  attachmentFolder,
  attachmentProblem,
  deleteAttachments,
  uploadAttachments,
} from '@/lib/chat/attachments';
import { GROUP_NAME_MAX, renameGroup, renameProblem, setGroupPicture } from '@/lib/chat/groups';
import type { ChatThread } from '@/lib/chat/types';
import { describeThrown } from '@/lib/describe-error';

/**
 * A group's name and picture, and the controls to change them.
 *
 * ---------------------------------------------------------------------------
 * Anybody in the group, and it says so
 * ---------------------------------------------------------------------------
 * The owner's decisions, 2026-09-30: a group has no owner, so anybody in it
 * can rename it or change its picture, and each change leaves a line in the
 * conversation saying who made it. The sentence under the controls says both,
 * so nobody changes a group thinking it is private to them. An event's group
 * keeps the event's name and takes no picture, and the members screen does
 * not draw this for one.
 *
 * ---------------------------------------------------------------------------
 * Not optimistic
 * ---------------------------------------------------------------------------
 * The name and picture are other people's too, and the database writes the
 * line that says who changed them. So the screen waits for it and then
 * re-reads, rather than drawing a change that might be refused. A refusal
 * keeps what was typed, and a picture that was refused is taken back out of
 * storage.
 *
 * ---------------------------------------------------------------------------
 * The picture goes where the group's photographs go
 * ---------------------------------------------------------------------------
 * threads/<id>/ in the private `chat` bucket, through the same upload a
 * photograph in a message takes — shrunk on the phone, refused over 10MB, not
 * a video. So only the group's members can read it, the same as its words.
 *
 * ---------------------------------------------------------------------------
 * Focus is not dropped
 * ---------------------------------------------------------------------------
 * Closing the rename form, and taking the picture away, both remove the
 * control that has focus. Left alone the browser puts focus back at the top
 * of the page, and a keyboard or switch user has to find their place again.
 * So opening the form puts focus in the name, closing it puts focus back on
 * the button that opened it, and taking the picture away puts it on the
 * picture button.
 */
export function GroupIdentity({
  thread,
  onChanged,
}: {
  thread: ChatThread;
  /** Re-read the thread, so the name and picture drawn are the database's. */
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(thread.name ?? '');
  const [busy, setBusy] = useState<'name' | 'picture' | 'unpicture' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const renameButton = useRef<HTMLButtonElement | null>(null);
  const pictureButton = useRef<HTMLButtonElement | null>(null);
  /** Where focus goes once the control that held it has gone. */
  const nameField = useRef<HTMLInputElement | null>(null);
  const [refocus, setRefocus] = useState<'rename' | 'picture' | 'field' | null>(null);

  useEffect(() => {
    if (refocus === 'rename') renameButton.current?.focus();
    if (refocus === 'picture') pictureButton.current?.focus();
    if (refocus === 'field') nameField.current?.focus();
    if (refocus) setRefocus(null);
  }, [refocus]);

  const problem = renameProblem(name, thread.name);
  const hasPicture = thread.photoPath !== null;

  function run(what: 'name' | 'picture' | 'unpicture', work: () => Promise<string | null>) {
    if (busy) return;
    setBusy(what);
    setFailure(null);
    work()
      .then((problem) => {
        if (problem) {
          setFailure(problem);
          return;
        }
        if (what === 'name') {
          setRenaming(false);
          setRefocus('rename');
        }
        if (what === 'unpicture') setRefocus('picture');
        onChanged();
      })
      .catch((e: unknown) => {
        setFailure(describeThrown(e, 'That did not work.'));
      })
      .finally(() => {
        setBusy(null);
      });
  }

  function saveName() {
    if (problem) return;
    run('name', async () => {
      const result = await renameGroup(thread.id, name);
      return result.ok ? null : result.error;
    });
  }

  function choosePicture(files: FileList | null) {
    const list = files ? [...files].slice(0, 1) : [];
    if (list.length === 0) return;
    const said = attachmentProblem(list, 0);
    if (said) {
      setFailure(said);
      return;
    }
    run('picture', async () => {
      const up = await uploadAttachments(list, attachmentFolder('thread', thread.id));
      if (!up.ok) return up.error;
      const [path] = up.value;
      if (!path) return 'The picture was not changed.';
      const result = await setGroupPicture(thread.id, path);
      if (!result.ok) {
        void deleteAttachments(up.value);
        return result.error;
      }
      return null;
    });
  }

  function takePictureAway() {
    run('unpicture', async () => {
      const result = await setGroupPicture(thread.id, null);
      return result.ok ? null : result.error;
    });
  }

  const secondary =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 font-bold font-head text-[0.875rem] text-navy transition-colors hover:bg-tint disabled:opacity-40';

  return (
    <section aria-labelledby="group-identity" className="mt-4">
      <h2
        id="group-identity"
        className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Name and picture
      </h2>
      <p className="mt-1.5 text-[0.78125rem] text-ink2 leading-[1.45]">
        Anybody in the group can change these. The conversation says who did.
      </p>

      {failure ? (
        <p
          role="alert"
          className="mt-2.5 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
        >
          {failure}
        </p>
      ) : null}

      {renaming ? (
        <div className="mt-2.5">
          <label
            htmlFor="group-name"
            className="block font-bold font-head text-[0.8125rem] text-ink"
          >
            The group’s name
          </label>
          <input
            ref={nameField}
            id="group-name"
            value={name}
            maxLength={GROUP_NAME_MAX}
            onChange={(event) => {
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveName();
            }}
            aria-describedby="group-name-hint"
            className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-navy"
          />
          <p id="group-name-hint" className="mt-1 text-[0.71875rem] text-grey">
            {problem ?? `${GROUP_NAME_MAX - name.length} characters left.`}
          </p>
          <div className="mt-2 flex gap-2.5">
            <button
              type="button"
              onClick={saveName}
              disabled={Boolean(problem) || busy !== null}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
            >
              {busy === 'name' ? 'Saving…' : 'Save the name'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setName(thread.name ?? '');
                setFailure(null);
                setRefocus('rename');
              }}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-[13px] border-[1.6px] border-line font-bold font-head text-[0.9375rem] text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2.5">
        {renaming ? null : (
          <button
            ref={renameButton}
            type="button"
            onClick={() => {
              setName(thread.name ?? '');
              setRenaming(true);
              setFailure(null);
              setRefocus('field');
            }}
            className={secondary}
          >
            Rename the group
          </button>
        )}
        {/* The platform's own picker, behind a real button: the camera roll
            and the camera on a phone. Hidden from the accessibility tree, as
            the photo picker's is, because the button is the control. */}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            choosePicture(event.target.files);
            // So the same file can be chosen again after a refusal.
            event.target.value = '';
          }}
        />
        <button
          ref={pictureButton}
          type="button"
          onClick={() => {
            input.current?.click();
          }}
          disabled={busy !== null}
          className={secondary}
        >
          <ImagePlus className="h-[1.2em] w-[1.2em]" aria-hidden="true" />
          {busy === 'picture'
            ? 'Uploading…'
            : hasPicture
              ? 'Change the picture'
              : 'Choose a picture'}
        </button>
        {hasPicture ? (
          <button
            type="button"
            onClick={takePictureAway}
            disabled={busy !== null}
            className={secondary}
          >
            {busy === 'unpicture' ? 'Taking it away…' : 'Take the picture away'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
