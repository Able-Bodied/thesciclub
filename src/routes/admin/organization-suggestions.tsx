import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

interface Suggestion {
  member_id: string;
  display_name: string;
  suggestion: string;
}

/**
 * What members wrote on the survey about organizations not in the directory
 * (20261031000000), to add the ones worth a row. Draws nothing until somebody
 * has written one.
 */
export function OrganizationSuggestions() {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const refusal = 'Could not load what members suggested.';
    void Promise.resolve(getSupabase().rpc('organization_suggestions')).then(
      ({ data, error: failure }: { data: unknown; error: Failure | null }) => {
        if (!live) return;
        if (failure) setError(describeError(failure, refusal));
        else setRows((data as Suggestion[] | null) ?? []);
      },
      (thrown: unknown) => {
        if (live) setError(describeThrown(thrown, refusal));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="mt-4 text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="font-extrabold font-head text-[0.96875rem] text-ink">Suggested by members</h2>
      <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
        Organizations members belong to that are not in the directory, in their words.
      </p>
      <ul className="mt-2.5 rounded-[14px] border border-line bg-paper px-3.5">
        {rows.map((row) => (
          <li key={row.member_id} className="border-line border-b py-2.5 last:border-b-0">
            <Link
              to={`/peers/${row.member_id}`}
              className="font-bold text-[0.8125rem] text-emphasis underline-offset-2 hover:underline"
            >
              {row.display_name}
            </Link>
            <p className="mt-0.5 whitespace-pre-line break-words text-[0.875rem] text-ink leading-[1.45]">
              {row.suggestion}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
