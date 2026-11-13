import { useEffect, useState } from 'react';
import { describeError } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * The asking price on a listing in For sale (the owner, 2026-11-12;
 * 20261112120000). Kept in whole cents in a table of its own, written only by
 * the listing's author.
 */

/** The room whose listings have a price. */
export const PRICED_ROOM = 'for-sale';

/** "$900", "$12.50", or "Free" for nothing at all. */
export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * What somebody typed in the price box, in cents. Null for blank (no price
 * given), undefined for something that is not a price. "$1,200", "1200" and
 * "12.5" are all fine.
 */
export function parsePrice(typed: string): number | null | undefined {
  const clean = typed.replace(/[$,\s]/g, '');
  if (clean === '') return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return undefined;
  const cents = Math.round(Number(clean) * 100);
  return cents <= 100_000_000 ? cents : undefined;
}

const NONE = new Map<string, number>();

/** Each listing's price, by topic id. Empty unless `enabled`, and while it loads. */
export function useListingPrices(
  topicIds: readonly string[],
  enabled: boolean,
): Map<string, number> {
  const key = enabled ? [...new Set(topicIds)].sort().join(',') : '';
  const [prices, setPrices] = useState<Map<string, number>>(NONE);

  useEffect(() => {
    if (!key) return;
    let live = true;
    void getSupabase()
      .from('chat_listing_prices')
      .select('topic_id, price_cents')
      .in('topic_id', key.split(','))
      .then(({ data, error }) => {
        // A database without the table yet: no prices, nothing broken.
        if (!live || error) return;
        const rows = data as { topic_id: string; price_cents: number }[];
        setPrices(new Map(rows.map((row) => [row.topic_id, row.price_cents])));
      });
    return () => {
      live = false;
    };
  }, [key]);

  return key ? prices : NONE;
}

/** Set a listing's price, or take it off with null. */
export async function setListingPrice(
  topicId: string,
  cents: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const table = getSupabase().from('chat_listing_prices');
  const { error } =
    cents === null
      ? await table.delete().eq('topic_id', topicId)
      : await table.upsert({
          topic_id: topicId,
          price_cents: cents,
          updated_at: new Date().toISOString(),
        });
  return error
    ? { ok: false, error: describeError(error, 'The price did not save.') }
    : { ok: true };
}
