import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { attachmentProblem, MAX_ATTACHMENTS } from '@/lib/chat/attachments';

/**
 * Choosing photographs to go with a message, a reply or a new topic.
 *
 * ---------------------------------------------------------------------------
 * One control, three places
 * ---------------------------------------------------------------------------
 * The composer under a thread and a topic, and the New topic form, all attach
 * photographs the same way: a button that opens the phone's picker, a strip of
 * what has been chosen with a way to take each one back, and a sentence when
 * something cannot be attached. Written once so the limits are applied once —
 * `attachmentProblem` is the one place that says four, images only, 10MB.
 *
 * ---------------------------------------------------------------------------
 * The strip shows the file, not the upload
 * ---------------------------------------------------------------------------
 * Nothing goes anywhere until Send. The thumbnails are object URLs of the
 * chosen files, so a member sees what they picked before it leaves the phone,
 * and taking one back costs nothing. The URLs are revoked when they go, which
 * on a phone with four 8MB photographs in memory is not a nicety.
 *
 * ---------------------------------------------------------------------------
 * A button, not a drop zone
 * ---------------------------------------------------------------------------
 * Drag and drop is a gesture some members here do not have. The button is
 * 44px, keyboard-reachable, and says what it does; the input behind it is the
 * platform's own picker, which on a phone is the camera roll and the camera.
 */
export function PhotoPicker({
  files,
  onChange,
  disabled = false,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** The composer's row: the button only, with the strip drawn above by the caller. */
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function choose(chosen: FileList | null) {
    const list = chosen ? [...chosen] : [];
    const said = attachmentProblem(list, files.length);
    setProblem(said);
    if (said) return;
    onChange([...files, ...list]);
  }

  const full = files.length >= MAX_ATTACHMENTS;

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          choose(event.target.files);
          // So the same photograph can be chosen again after being taken back.
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => {
          input.current?.click();
        }}
        aria-label={full ? `${MAX_ATTACHMENTS} photographs is the most` : 'Add a photograph'}
        title={full ? `${MAX_ATTACHMENTS} photographs is the most` : 'Add a photograph'}
        className={
          compact
            ? 'grid h-11 w-11 flex-none place-items-center rounded-full bg-tint text-navy transition-colors hover:bg-line disabled:opacity-35'
            : 'inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 font-bold font-head text-[0.875rem] text-navy transition-colors hover:bg-tint disabled:opacity-35'
        }
      >
        <ImagePlus className="h-[19px] w-[19px]" aria-hidden="true" />
        {compact ? null : full ? 'Four is the most' : 'Add a photograph'}
      </button>
      {problem ? (
        <p className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]" role="alert">
          {problem}
        </p>
      ) : null}
    </>
  );
}

/**
 * A stable key per File object. The same photograph chosen twice is two
 * files and two keys; its name and size would be one, and the index is what
 * the linter rightly refuses.
 */
const keys = new WeakMap<File, number>();
let nextKey = 0;
function keyFor(file: File): number {
  let key = keys.get(file);
  if (key === undefined) {
    nextKey += 1;
    key = nextKey;
    keys.set(file, key);
  }
  return key;
}

/** What has been chosen, each with a way to take it back. */
export function PhotoStrip({
  files,
  onRemove,
  disabled = false,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const made = files.map((file) => URL.createObjectURL(file));
    setUrls(made);
    return () => {
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [files]);

  if (files.length === 0) return null;

  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label="Photographs to send">
      {files.map((file, index) => (
        <li key={keyFor(file)} className="relative">
          <img
            src={urls[index]}
            alt={file.name}
            className="block h-[4.5rem] w-[4.5rem] rounded-[10px] bg-tint object-cover"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onRemove(index);
            }}
            aria-label={`Take back ${file.name}`}
            data-target="small"
            className="-top-1.5 -right-1.5 absolute grid h-6 w-6 place-items-center rounded-full bg-navy text-white shadow-[0_2px_6px_rgba(10,20,35,.3)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
