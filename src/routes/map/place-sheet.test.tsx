import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { makeMember } from '@/test/factory';
import type { BrowseMember } from '@/types/domain';

vi.mock('@/lib/map', () => ({ loadMapCanvas: () => Promise.resolve({ default: () => null }) }));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null }));

const { PlaceSheet } = await import('@/routes/map/club-map');

const sanJose = Array.from({ length: 12 }, (_, i) =>
  makeMember({
    id: `m${i}`,
    displayName: `Member ${i + 1}`,
    city: 'San Jose',
    levelRange: 'C5–C8',
    exactLevel: null,
    completeness: 'Do not know',
    age: 30 + i,
  }),
);

function Profile() {
  const location = useLocation();
  return (
    <p>
      Profile {location.pathname} from {JSON.stringify(location.state)}
    </p>
  );
}

function renderSheet(members: BrowseMember[], area = false) {
  render(
    <MemoryRouter initialEntries={['/peers?view=map']}>
      <Routes>
        <Route
          path="/peers"
          element={
            <PlaceSheet
              contents={{ events: [], members, organizations: [] }}
              layers={new Set(['peers'])}
              area={area}
              zoomIn={undefined}
              events={[]}
              renderEvent={undefined}
              backState={{ from: 'peers-map' }}
              onClose={() => undefined}
            />
          }
        />
        <Route path="/peers/:id" element={<Profile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("a city's members on the map", () => {
  it('lists each as a compact row: name, then level and age, without the city again', () => {
    renderSheet(sanJose);
    expect(screen.getByRole('dialog', { name: '12 members here' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('button');
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveAccessibleName('Member 1, C5–C8 · 30');
    expect(screen.queryByRole('button', { name: /San Jose/ })).toBeNull();
  });

  it('opens the profile with the way back to the map', async () => {
    renderSheet(sanJose);
    await userEvent.click(screen.getByRole('button', { name: 'Member 3, C5–C8 · 32' }));
    expect(screen.getByText('Profile /peers/m2 from {"from":"peers-map"}')).toBeInTheDocument();
  });

  it('names the city where the list spans several, as "in this area" does', () => {
    renderSheet(
      [sanJose[0], makeMember({ id: 'o', displayName: 'Oak', city: 'Oakland', age: 50 })].flatMap(
        (m) => (m ? [m] : []),
      ),
      true,
    );
    expect(screen.getByRole('dialog', { name: '2 members in this area' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Member 1, C5–C8 · 30 · San Jose' })).toBeVisible();
  });
});
