import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOrganizations } from '@/lib/organizations';

interface Read {
  data: unknown[] | null;
  error: null;
}
let finishRead: ((read: Read) => void) | null = null;

// One read for the whole club, finished when the test says.
vi.mock('@/lib/read-pages', () => ({
  readPages: () =>
    new Promise<Read>((resolve) => {
      finishRead = resolve;
    }),
}));

const ROW = {
  id: 'o1',
  short_code: 'NCS',
  name: 'NorCal SCI',
  city: null,
  description: null,
  tags: [],
  can_invite: true,
  logo_path: null,
};

function Names({ id }: { id: string }) {
  const { organizations, loading } = useOrganizations();
  return <p data-testid={id}>{loading ? 'loading' : organizations.map((o) => o.name).join()}</p>;
}

/** Finishes the read in the gap between a screen being drawn and its effects running. */
function FinishDuringCommit() {
  useLayoutEffect(() => {
    finishRead?.({ data: [ROW], error: null });
  }, []);
  return null;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('the organizations list shared between screens', () => {
  // Real scheduling, not act(): act runs effects straight after the commit,
  // which closes the gap this is about.
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };
  const wasActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  afterEach(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
  });

  // Another screen's read can land after a screen is drawn as loading but
  // before its effect runs (lazy screens and transitions make that gap
  // common). The effect then sees a fresh list and starts no read of its own,
  // so the screen has to take the list it found, or it says loading for good.
  it('reaches a screen drawn while another screen was still reading', async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    const firstRoot = createRoot(first);
    const secondRoot = createRoot(second);

    firstRoot.render(<Names id="first" />);
    await settle();
    expect(first.textContent).toBe('loading');

    secondRoot.render(
      <>
        <Names id="second" />
        <FinishDuringCommit />
      </>,
    );
    await settle();

    expect(first.textContent).toBe('NorCal SCI');
    expect(second.textContent).toBe('NorCal SCI');

    firstRoot.unmount();
    secondRoot.unmount();
    first.remove();
    second.remove();
  });
});
