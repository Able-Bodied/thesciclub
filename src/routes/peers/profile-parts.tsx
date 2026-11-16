/**
 * The pieces a member's profile is made of: a section with its heading, a row
 * of the details card, a row of chips. Shared by the profile members see
 * (member-detail.tsx) and the public one on About us (routes/about/), so the
 * two look the same.
 */

import type { BeforeAfter } from '@/types/domain';

/**
 * "Children", for the details card.
 *
 * Whether somebody became a parent before or after their injury is the part a
 * peer is actually reaching for. Raising a child you already had and learning
 * to parent from a chair from the start are different experiences, and they
 * draw different questions — so the survey has asked it all along
 * (`children_when`, Before/After/Both) and no screen showed the answer.
 *
 * Only rendered for members who said yes. A row reading "Children: No" is not
 * the fact this exists to carry, and nobody answering a yes/no about their
 * family asked for the negative to be published on their profile.
 */
export function childrenLabel(
  hasChildren: boolean | null,
  when: BeforeAfter | null,
): string | null {
  if (hasChildren !== true) return null;
  if (when === 'Before') return 'Yes — before the injury';
  if (when === 'After') return 'Yes — since the injury';
  if (when === 'Both') return 'Yes — before and since the injury';
  return 'Yes';
}

/** A labelled row in the details card, skipped entirely when empty. */
export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 border-line border-b py-3 last:border-b-0">
      <span className="w-[104px] flex-none text-[0.78125rem] text-grey">{label}</span>
      <span className="text-[0.85rem] leading-[1.42]">{value}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // `flow-root`, so the heading and what is under it move past the floated
    // picture together. As loose siblings, a heading whose line landed in the
    // float's last few pixels sat beside the photograph while its chips, a
    // block, dropped below it at full width — "Interests" in one column and
    // Cycling · Volunteering in the other. One block is placed beside the
    // float or below it, never both.
    <div className="flow-root">
      <h2 className="mt-5 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function Chips({ items, tone }: { items: string[]; tone: 'solid' | 'outline' | 'gold' }) {
  const cls =
    tone === 'gold'
      ? 'bg-gold-lt text-gold-dp'
      : tone === 'outline'
        ? 'border border-line text-ink2'
        : 'bg-tint text-emphasis';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full px-2.5 py-[5px] font-semibold text-[0.7375rem] leading-[1.25] ${cls}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
