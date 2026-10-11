import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { attachmentProblem } from '@/lib/chat/attachments';
import type { CoverChange } from '@/lib/events';
import { usePhotoUrl } from '@/lib/photos';

/**
 * The event form's cover picture (the owner, 2026-10-10): one picture, a
 * flyer or the venue, shown at the top of the event's page and small on its
 * card. Chosen here; uploaded only when the event is saved, so nothing is
 * stored for an event that is never added.
 *
 * "Describe the picture" is optional, and says why: it is what a screen
 * reader says, and for a flyer whose words are the event's own, nothing is
 * the right answer.
 */
export function CoverField({
  value,
  onChange,
  labelClassName,
  hintClassName,
  fieldClassName,
}: {
  value: CoverChange;
  onChange: (next: CoverChange) => void;
  labelClassName: string;
  hintClassName: string;
  fieldClassName: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const saved = usePhotoUrl(value.kind === 'keep' ? value.path : null);
  const [local, setLocal] = useState<string | null>(null);

  // A preview of a chosen file, released when it is replaced or the form goes.
  useEffect(() => {
    if (value.kind !== 'new') {
      setLocal(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setLocal(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [value]);

  const preview = value.kind === 'new' ? local : value.kind === 'keep' ? saved : null;
  const hasPicture = value.kind === 'new' || (value.kind === 'keep' && value.path !== null);
  const alt = value.kind === 'remove' ? '' : value.alt;

  function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const said = attachmentProblem([file], 0);
    setProblem(said);
    if (said) return;
    onChange({ kind: 'new', file, alt });
  }

  return (
    <>
      <p className={labelClassName} id="event-cover-label">
        Cover picture (optional)
      </p>
      <p className={hintClassName}>
        A flyer or a photograph of the place, shown at the top of the event.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          choose(e.target.files);
          // So the same file can be chosen again after being taken off.
          e.target.value = '';
        }}
      />

      {hasPicture ? (
        <div className="mt-2 flex items-start gap-3">
          {preview ? (
            <img
              src={preview}
              alt=""
              className="h-24 w-24 flex-none rounded-[12px] border border-line bg-tint object-cover"
            />
          ) : (
            <span className="h-24 w-24 flex-none rounded-[12px] border border-line bg-tint" />
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-describedby="event-cover-label"
              className="min-h-[44px] rounded-[12px] border-[1.6px] border-emphasis px-3.5 font-bold font-head text-[0.875rem] text-emphasis"
            >
              Change picture
            </button>
            <button
              type="button"
              onClick={() => {
                setProblem(null);
                onChange({ kind: 'remove' });
              }}
              className="min-h-[44px] rounded-[12px] px-3.5 text-left font-semibold text-[0.875rem] text-destructive"
            >
              Remove picture
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border-[1.6px] border-line bg-paper px-3.5 font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint"
        >
          <ImagePlus className="h-[19px] w-[19px]" aria-hidden="true" />
          Add a picture
        </button>
      )}
      {problem ? (
        <p role="alert" className="mt-1.5 text-[0.78125rem] text-destructive leading-[1.45]">
          {problem}
        </p>
      ) : null}

      {hasPicture ? (
        <>
          <label htmlFor="event-cover-alt" className={labelClassName}>
            Describe the picture (optional)
          </label>
          <input
            id="event-cover-alt"
            value={alt}
            maxLength={200}
            onChange={(e) => {
              onChange({ ...value, alt: e.target.value });
            }}
            aria-describedby="event-cover-alt-hint"
            placeholder="The patio at Lakeside Park, step-free from the car park"
            className={fieldClassName}
          />
          <p id="event-cover-alt-hint" className={hintClassName}>
            Read aloud to members who use a screen reader. Leave it empty for a flyer whose words
            are the event's own.
          </p>
        </>
      ) : null}
    </>
  );
}
