import { useState } from 'react';
import { matchesOrganizationSearch } from '@/routes/admin/organizations-section';
import type { Organization } from '@/types/domain';

const MOST_FOUND = 8;

/**
 * Choosing who a code, link or invite is for (the owner, 2026-11-05): the
 * organizations you belong to first, then a search box for the rest, since
 * the directory is too long to scroll.
 *
 * `value` '' is the `none` choice when there is one. An organization found by
 * searching joins the list while it is chosen.
 */
export function OrganizationPicker({
  id,
  label,
  yours,
  yoursLabel = 'Your organizations',
  others = [],
  value,
  onChange,
  none,
  noneValue = '',
  placeholder,
  labelClassName = 'block font-bold text-[0.8125rem] text-ink',
  disabled = false,
  className,
}: {
  id: string;
  label: string;
  yours: Organization[];
  yoursLabel?: string;
  /** Searchable, never listed. */
  others?: Organization[];
  value: string;
  onChange: (id: string) => void;
  /** The choice with no organization, if there is one. */
  none?: string | undefined;
  /** Its value, when '' is the placeholder's. */
  noneValue?: string;
  labelClassName?: string;
  /** Shown first while nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  className: string;
}) {
  const [find, setFind] = useState('');
  const yourIds = new Set(yours.map((organization) => organization.id));
  const rest = others.filter((organization) => !yourIds.has(organization.id));
  const chosenElsewhere = rest.find((organization) => organization.id === value);
  const found =
    find.trim() === ''
      ? []
      : rest
          .filter((organization) => matchesOrganizationSearch(organization, find))
          .slice(0, MOST_FOUND);

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={className}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {yours.length > 0 ? (
          <optgroup label={yoursLabel}>
            {yours.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {chosenElsewhere ? (
          <optgroup label="Found">
            <option value={chosenElsewhere.id}>{chosenElsewhere.name}</option>
          </optgroup>
        ) : null}
        {none !== undefined ? <option value={noneValue}>{none}</option> : null}
      </select>

      {rest.length > 0 && !disabled ? (
        <div className="mt-2">
          <label htmlFor={`${id}-find`} className="block text-[0.75rem] text-ink2">
            Or find another organization
          </label>
          <input
            id={`${id}-find`}
            type="search"
            autoComplete="off"
            value={find}
            onChange={(e) => {
              setFind(e.target.value);
            }}
            placeholder="Name, abbreviation or town"
            className="mt-1 min-h-[44px] w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-emphasis"
          />
          {find.trim() === '' ? null : found.length === 0 ? (
            <p role="status" className="mt-1.5 text-[0.8125rem] text-grey">
              No organization matches that.
            </p>
          ) : (
            <ul
              aria-label="Organizations found"
              className="mt-1.5 rounded-[11px] border border-line py-1"
            >
              {found.map((organization) => (
                <li key={organization.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(organization.id);
                      setFind('');
                    }}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[0.875rem] text-ink hover:bg-tint"
                  >
                    <span>{organization.name}</span>
                    {organization.city ? (
                      <span className="shrink-0 text-[0.75rem] text-grey">
                        {organization.state
                          ? `${organization.city}, ${organization.state}`
                          : organization.city}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
