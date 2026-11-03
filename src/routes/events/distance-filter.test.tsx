import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findFilterPlace, setFilterPlace } from '@/lib/filter-place';
import { DistanceFilter } from '@/routes/events/distance-filter';

describe('the distance slider', () => {
  it('says how far, from where, and goes to any distance at its far end', () => {
    const onChange = vi.fn();
    render(<DistanceFilter miles={20} city="San Jose" status="ready" onChange={onChange} />);
    const slider = screen.getByLabelText('Within 20 miles of San Jose');
    expect(slider).toHaveValue('20');
    fireEvent.change(slider, { target: { value: '45' } });
    expect(onChange).toHaveBeenLastCalledWith(45);
    fireEvent.change(slider, { target: { value: '205' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('reads "Any distance" at the far end', () => {
    render(<DistanceFilter miles={null} city="San Jose" status="any" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Any distance')).toHaveValue('205');
  });

  it('says so when the city is not on the map yet', () => {
    render(<DistanceFilter miles={20} city="Davis" status="unplaced" onChange={vi.fn()} />);
    expect(screen.getByText(/Davis isn't on our map yet/)).toBeInTheDocument();
  });
});

describe('Change, beside the city', () => {
  afterEach(() => {
    setFilterPlace(null);
    vi.unstubAllGlobals();
  });

  function answer(body: unknown) {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('measures from a city typed instead, until Back to home', async () => {
    const fetch = answer([
      {
        lat: '45.52',
        lon: '-122.68',
        addresstype: 'city',
        address: { city: 'Portland', state: 'Oregon', country_code: 'us' },
      },
    ]);
    render(<DistanceFilter miles={50} city="San Jose" status="ready" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.type(screen.getByLabelText('City, state or ZIP code'), 'Portland OR');
    await userEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(await screen.findByLabelText('Within 50 miles of Portland, OR')).toBeInTheDocument();
    expect(String(fetch.mock.calls[0]?.[0])).toContain('q=Portland%20OR');
    expect(screen.getByText('From the middle of Portland, OR.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to San Jose' }));
    expect(screen.getByLabelText('Within 50 miles of San Jose')).toBeInTheDocument();
  });

  it('looks a ZIP code up as one', async () => {
    const fetch = answer([
      {
        lat: '38.54',
        lon: '-121.74',
        addresstype: 'postcode',
        address: { town: 'Davis', state: 'California', postcode: '95616', country_code: 'us' },
      },
    ]);
    const place = await findFilterPlace('95616');
    expect(String(fetch.mock.calls[0]?.[0])).toContain('postalcode=95616');
    expect(place).toEqual({
      label: 'Davis, CA 95616',
      latitude: 38.54,
      longitude: -121.74,
      state: 'CA',
    });
  });

  it('is there at any distance too, and a place chosen there looks within 50 miles', async () => {
    answer([
      {
        lat: '45.52',
        lon: '-122.68',
        addresstype: 'city',
        address: { city: 'Portland', state: 'Oregon', country_code: 'us' },
      },
    ]);
    const onChange = vi.fn();
    render(<DistanceFilter miles={null} city="San Jose" status="any" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.type(screen.getByLabelText('City, state or ZIP code'), 'Portland OR');
    await userEvent.click(screen.getByRole('button', { name: 'Use' }));
    await screen.findByRole('button', { name: 'Back to San Jose' });
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it('says so when nothing is found, and keeps home', async () => {
    answer([]);
    render(<DistanceFilter miles={50} city="San Jose" status="ready" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.type(screen.getByLabelText('City, state or ZIP code'), 'Nowhere');
    await userEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not find that place');
    expect(screen.getByLabelText('Within 50 miles of San Jose')).toBeInTheDocument();
  });
});
