import { useId, useState } from 'react';
import {
  formatPrice,
  parsePrice,
  setListingPrice,
  useListingPrices,
} from '@/lib/chat/listing-prices';

/**
 * The price under a For sale listing's title, and, for its seller, a way to
 * set or change it (the owner, 2026-11-12). Nothing at all for anybody else
 * when no price was given.
 */
export function ListingPrice({ topicId, isSeller }: { topicId: string; isSeller: boolean }) {
  const read = useListingPrices([topicId], true);
  // What the seller saved here, ahead of a re-read: undefined until they do.
  const [mine, setMine] = useState<number | null | undefined>(undefined);
  const cents = mine === undefined ? read.get(topicId) : (mine ?? undefined);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const id = useId();

  function save() {
    const next = parsePrice(text);
    if (next === undefined) {
      setFailure('Write the price as a number, like 250 or 12.50.');
      return;
    }
    setSaving(true);
    setFailure(null);
    void setListingPrice(topicId, next)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        setMine(next);
        setEditing(false);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  if (editing) {
    return (
      <div className="mt-1.5">
        <label htmlFor={id} className="sr-only">
          Price in dollars
        </label>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="font-bold text-ink2">
            $
          </span>
          <input
            id={id}
            inputMode="decimal"
            maxLength={12}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            placeholder="Blank for offers"
            className="min-h-[44px] w-[10rem] rounded-[12px] border-[1.6px] border-line bg-paper px-3 py-2 text-[1rem] text-ink outline-none focus:border-emphasis"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-[44px] rounded-[12px] bg-gold px-4 font-bold font-head text-[0.875rem] text-on-gold disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setFailure(null);
            }}
            className="min-h-[44px] px-2 text-[0.8125rem] text-grey"
          >
            Cancel
          </button>
        </div>
        {failure ? (
          <p role="alert" className="mt-1 text-[0.78125rem] text-destructive">
            {failure}
          </p>
        ) : null}
      </div>
    );
  }

  if (cents === undefined && !isSeller) return null;
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
      {cents !== undefined ? (
        <span className="font-extrabold font-head text-[1.125rem] text-ink">
          {formatPrice(cents)}
        </span>
      ) : null}
      {isSeller ? (
        <button
          type="button"
          onClick={() => {
            setText(cents !== undefined ? String(cents / 100) : '');
            setEditing(true);
          }}
          className="min-h-[44px] px-1 text-[0.8125rem] text-emphasis underline underline-offset-2"
        >
          {cents !== undefined ? 'Change price' : 'Add a price'}
        </button>
      ) : null}
    </p>
  );
}
