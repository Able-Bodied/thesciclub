import { useState } from 'react';
import type { ReportedProfile } from '@/lib/chat/types';
import { usePhotoUrl } from '@/lib/photos';

/**
 * A reported profile as it was when it was reported (20261022130000): the
 * photograph, the name and @username, and what the member wrote. Nothing here
 * is read from the member's row, so editing or deleting the profile changes
 * none of it. Answers the member left empty are not drawn.
 */
export function ReportedProfileCopy({
  profile,
  photoPath,
}: {
  profile: ReportedProfile;
  photoPath: string | null;
}) {
  const answers: [string, string | null][] = [
    ['Bio', profile.bio],
    ['How it happened', profile.howInjured],
    ['Uses day to day', profile.detail],
    ['Adaptive sports equipment', profile.sportsEquipment],
    ['Grants', profile.grants],
    ['Field of work', profile.fieldOfWork],
  ];
  const lists: [string, string[]][] = [
    ['Interests', profile.interests],
    ['Happy to talk about', profile.topics],
    ['Self-care', profile.selfCare],
  ];
  return (
    <div className="mt-1.5 border-line border-l-2 pl-2.5">
      <ReportedPhoto path={photoPath} alt={profile.photoAlt} />
      <p className="font-extrabold font-head text-[0.9375rem] text-ink leading-[1.35]">
        {profile.displayName}
        {profile.username ? (
          <span className="ml-2 font-semibold text-[0.8125rem] text-grey">@{profile.username}</span>
        ) : null}
      </p>
      {profile.photoAlt ? (
        <p className="mt-1 text-[0.75rem] text-grey leading-[1.45]">
          Photograph described as: {profile.photoAlt}
        </p>
      ) : null}
      {answers.map(([label, value]) =>
        value ? (
          <div key={label} className="mt-2">
            <p className="font-extrabold font-head text-[0.6875rem] text-grey uppercase tracking-[0.13em]">
              {label}
            </p>
            <p className="whitespace-pre-line text-[0.8125rem] text-ink leading-[1.5]">{value}</p>
          </div>
        ) : null,
      )}
      {lists.map(([label, items]) =>
        items.length > 0 ? (
          <div key={label} className="mt-2">
            <p className="font-extrabold font-head text-[0.6875rem] text-grey uppercase tracking-[0.13em]">
              {label}
            </p>
            <p className="text-[0.8125rem] text-ink leading-[1.5]">{items.join(' · ')}</p>
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * The reported photograph itself. It is the original, not a copy: no SQL can
 * copy a file, so the report names it and it cannot be deleted or overwritten
 * (20261022130000). It is drawn whole, uncropped.
 */
function ReportedPhoto({ path, alt }: { path: string | null; alt: string | null }) {
  const url = usePhotoUrl(path);
  const [broken, setBroken] = useState(false);
  if (!path) {
    return <p className="mb-1.5 text-[0.75rem] text-grey leading-[1.45]">No profile photograph.</p>;
  }
  return (
    <div className="mb-1.5 max-w-[16rem]">
      {url && !broken ? (
        <img
          src={url}
          alt={alt ?? 'The reported profile photograph'}
          className="max-h-[20rem] w-full rounded-[12px] object-contain"
          onError={() => {
            setBroken(true);
          }}
        />
      ) : (
        <p className="text-[0.75rem] text-grey leading-[1.45]">
          {broken ? 'The photograph could not be opened.' : 'Opening the photograph…'}
        </p>
      )}
      <p className="mt-1 text-[0.71875rem] text-grey leading-[1.45]">
        The photograph was reported with the profile, and kept: the member changing or deleting
        their photograph, or their account, does not delete this one.
      </p>
    </div>
  );
}
