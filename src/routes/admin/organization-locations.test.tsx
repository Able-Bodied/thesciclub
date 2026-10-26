import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  OrganizationLocations,
  type PlaceDraft,
  placesToSave,
  toDrafts,
} from '@/routes/admin/organization-locations';

const start = toDrafts([
  { id: 'a', label: 'Main office', address: '3075 Adeline St', city: 'Berkeley', state: 'CA' },
  { id: 'b', label: null, address: null, city: 'Fremont', state: 'CA' },
]);

let latest: PlaceDraft[] = [];
function Editor() {
  const [places, setPlaces] = useState(start);
  latest = places;
  return <OrganizationLocations places={places} onChange={setPlaces} />;
}

const cities = () => latest.map((place) => place.city);

describe("an organization's locations in its editor", () => {
  it('says a published street address gets a pin, and a P.O. box or store mailbox does not', () => {
    render(<Editor />);
    expect(screen.getByText(/A street address it publishes gets an exact pin/)).toBeVisible();
    expect(screen.getByText(/P\.O\. box or a mailbox at a shipping store/)).toBeVisible();
    expect(screen.getByRole('group', { name: 'Location 1 (main)' })).toBeVisible();
  });

  it('moves a location up and down, the first being the main one', async () => {
    render(<Editor />);
    expect(screen.getByRole('button', { name: 'Move location 1 up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move location 2 up' }));
    expect(cities()).toEqual(['Fremont', 'Berkeley']);
    await userEvent.click(screen.getByRole('button', { name: 'Move location 1 down' }));
    expect(cities()).toEqual(['Berkeley', 'Fremont']);
  });

  it('adds and removes locations, keeping what is typed in the right one', async () => {
    render(<Editor />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a location' }));
    const third = screen.getByRole('group', { name: 'Location 3' });
    await userEvent.type(within(third).getByRole('textbox', { name: 'City' }), 'Oakland');
    await userEvent.click(screen.getByRole('button', { name: 'Remove location 2' }));
    expect(cities()).toEqual(['Berkeley', 'Oakland']);
  });

  it('saves each location with a city and a state, drops an empty one, and says what is missing', () => {
    expect(
      placesToSave([...start, ...toDrafts([{ label: null, address: null, city: '', state: '' }])]),
    ).toEqual([
      { id: 'a', label: 'Main office', address: '3075 Adeline St', city: 'Berkeley', state: 'CA' },
      { id: 'b', label: null, address: null, city: 'Fremont', state: 'CA' },
    ]);
    expect(placesToSave(toDrafts([{ label: null, address: null, city: 'Reno', state: '' }]))).toBe(
      'Each location needs a city and a state.',
    );
  });
});
