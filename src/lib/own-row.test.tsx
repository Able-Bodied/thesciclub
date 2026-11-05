import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireMember } from '@/components/require-member';
import { useAccount } from '@/lib/account';
import { useOwnMember } from '@/lib/members';
import { loadDetails, saveDetails } from '@/routes/profile/details-api';
import { hasPhoto, loadAnswers } from '@/routes/profile/profile-api';

/** The member's own row: requests per screen, counted (free plan, 2026-11-05). */

const db = vi.hoisted(() => {
  const row: Record<string, unknown> = { id: 'me', status: 'active', display_name: 'Dana' };
  /** reads: each members read, by the columns it named. */
  return { row, reads: [] as string[], writes: 0 };
});

vi.mock('@/lib/push/notifications', () => ({
  restoreDeviceNotifications: () => Promise.resolve('off'),
  forgetThisDevice: () => Promise.resolve(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'me' } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => {
      let columns = '';
      const query = {
        select: (c: string) => {
          columns = c;
          return query;
        },
        eq: () => query,
        abortSignal: () => query,
        maybeSingle: () => {
          db.reads.push(columns);
          return Promise.resolve({ data: { ...db.row }, error: null });
        },
        update: () => ({
          eq: () => {
            db.writes += 1;
            return Promise.resolve({ error: null });
          },
        }),
      };
      return query;
    },
  }),
}));

/** What Me and Home's card read on a show: the row four ways. */
function Screen({ next }: { next: string }) {
  const { userId } = useAccount();
  const own = useOwnMember(userId);
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.all([loadAnswers(), loadDetails(), hasPhoto()]).then(() => {
      setReady(true);
    });
  }, []);
  return (
    <div>
      <p>{ready && !own.loading ? `Shown for ${own.member?.displayName ?? '?'}` : 'Loading'}</p>
      <button type="button" onClick={() => void navigate(next)}>
        Next
      </button>
    </div>
  );
}

const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
};

function renderClub() {
  return render(
    <MemoryRouter initialEntries={['/me']}>
      <Routes>
        {['/me', '/home', '/peers'].map((path, i, all) => (
          <Route
            key={path}
            path={path}
            element={
              <RequireMember>
                <Screen next={all[(i + 1) % all.length] ?? '/me'} />
              </RequireMember>
            }
          />
        ))}
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.row = { id: 'me', status: 'active', display_name: 'Dana', state: 'CA' };
  db.reads = [];
  db.writes = 0;
});

describe("the member's own row", () => {
  it('is read once per screen, by the door, not by each part of it', async () => {
    renderClub();
    await screen.findByText('Shown for Dana');
    // Was 5: the door, useOwnMember, the answers, the details, the photo.
    expect(db.reads).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle();
    await screen.findByText('Shown for Dana');
    // Was 10 after two screens.
    expect(db.reads).toHaveLength(2);
  });

  it('still shows a pause on the very next screen', async () => {
    renderClub();
    await screen.findByText('Shown for Dana');
    db.row = { ...db.row, status: 'suspended' };
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Your membership is paused');
  });

  it('is read again after the member saves their own details', async () => {
    renderClub();
    await screen.findByText('Shown for Dana');
    const before = db.reads.length;
    await loadDetails();
    expect(db.reads).toHaveLength(before);
    db.row = { ...db.row, display_name: 'Dee' };
    const loaded = await loadDetails();
    if (!loaded.ok) throw new Error(loaded.error);
    await saveDetails('me', { ...loaded.details, displayName: 'Dee' }, 'C5–C8');
    expect(db.writes).toBe(1);
    const after = await loadDetails();
    expect(after.ok && after.details.displayName).toBe('Dee');
    expect(db.reads).toHaveLength(before + 1);
  });

  it('is read fresh by a form that will be saved over', async () => {
    renderClub();
    await screen.findByText('Shown for Dana');
    const before = db.reads.length;
    db.row = { ...db.row, display_name: 'Changed elsewhere' };
    const loaded = await loadDetails({ fresh: true });
    expect(loaded.ok && loaded.details.displayName).toBe('Changed elsewhere');
    expect(db.reads).toHaveLength(before + 1);
  });
});
