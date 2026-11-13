import { useEffect, useId, useState } from 'react';
import { useAccount } from '@/lib/account';
import { placeLine } from '@/lib/chat/author-places';
import { geocodeZip } from '@/lib/geocode';
import { directoryChanged } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * In a Classifieds room's new-topic form, a member with no city on their
 * profile is asked for a ZIP code (the owner, 2026-11-12): listings there say
 * where the seller is by themselves (author-places.ts), and this is the
 * moment the missing city matters.
 *
 * Not asked of somebody who has said they would rather not give a city
 * (`declined`), or who is off the directory: their listings show no city
 * either way, so asking would be for nothing. The ZIP is written to their
 * profile, as the details form writes it, with the city and state it names.
 */
type Need = 'loading' | 'ask' | 'none';

export function PlaceAsk() {
  const account = useAccount();
  const userId = account.status === 'member' ? account.userId : null;
  const [need, setNeed] = useState<Need>('loading');
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void getSupabase()
      .from('members')
      .select('city, state, declined, show_in_browse')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        // Taken as unknowns and checked, rather than trusted as a shape.
        const row = data as Record<string, unknown> | null;
        if (error || !row) {
          setNeed('none');
          return;
        }
        const missing = typeof row.city !== 'string' || row.city.trim() === '';
        const declined = Array.isArray(row.declined) && row.declined.includes('city');
        setNeed(missing && !declined && row.show_in_browse === true ? 'ask' : 'none');
      });
    return () => {
      live = false;
    };
  }, [userId]);

  if (saved) {
    return (
      <p role="status" className="mt-4 text-[0.8125rem] text-ink2">
        Thanks. Your listings will show {saved}.
      </p>
    );
  }
  if (need !== 'ask' || !userId) return null;

  function save() {
    if (!userId || saving) return;
    const clean = zip.replace(/\D/g, '').slice(0, 5);
    if (clean.length !== 5) {
      setFailure('A ZIP code is five digits.');
      return;
    }
    setSaving(true);
    setFailure(null);
    void (async () => {
      const place = await geocodeZip(clean);
      if (!place) {
        setFailure('We could not find that ZIP code. Check it and try again.');
        return;
      }
      const { error } = await getSupabase()
        .from('members')
        .update({ zip: clean, city: place.city, state: place.state })
        .eq('id', userId);
      if (error) {
        setFailure('That did not save. Try again in a moment.');
        return;
      }
      directoryChanged();
      setSaved(placeLine(place.city, place.state) ?? 'where you are');
    })().finally(() => {
      setSaving(false);
    });
  }

  return (
    <div className="mt-4 rounded-[13px] border border-line bg-tint px-3.5 py-3">
      <label htmlFor={id} className="block font-bold font-head text-[0.8125rem] text-ink">
        Where are you?
      </label>
      <p className="mt-0.5 text-[0.75rem] text-grey leading-[1.45]">
        Listings here show the city on your profile, and yours has none yet. Add your ZIP code and
        we will fill it in. You can change it on your profile any time.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          value={zip}
          onChange={(event) => {
            setZip(event.target.value);
          }}
          placeholder="95112"
          className="min-h-[44px] w-[8rem] rounded-[12px] border-[1.6px] border-line bg-paper px-3 py-2 text-[1rem] text-ink outline-none focus:border-emphasis"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-[44px] rounded-[12px] border-[1.6px] border-emphasis px-4 font-bold font-head text-[0.875rem] text-emphasis disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
      {failure ? (
        <p role="alert" className="mt-1.5 text-[0.78125rem] text-destructive">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
