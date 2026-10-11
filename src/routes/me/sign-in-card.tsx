import type { ReactNode } from 'react';

/** One way of signing in, as a card under Me → Account → Signing in. */
export function SignInCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[17px] border border-line bg-paper p-3.5">
      <h3 className="font-extrabold font-head text-[0.9375rem] text-ink">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export const CARD_BUTTON =
  'mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[11px] border-[1.6px] border-emphasis font-bold font-head text-[0.875rem] text-emphasis transition-colors hover:bg-tint disabled:opacity-50';

export const PRIMARY_BUTTON =
  'mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[11px] bg-action font-bold font-head text-[0.875rem] text-white transition-colors hover:bg-action-hi disabled:opacity-50';

export const FIELD =
  'mt-1.5 min-h-[48px] w-full rounded-[13px] border-[1.6px] border-line bg-canvas px-[13px] text-[1rem] text-ink outline-none focus:border-emphasis focus:bg-paper';

export const FIELD_LABEL =
  'mt-3 block font-extrabold font-head text-[0.71875rem] text-grey uppercase tracking-[0.13em]';

export function CardError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
      {children}
    </p>
  );
}
