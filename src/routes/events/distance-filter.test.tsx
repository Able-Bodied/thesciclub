import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DistanceFilter } from '@/routes/events/distance-filter';

describe('the distance slider', () => {
  it('says how far, from where, and goes to any distance at its far end', () => {
    const onChange = vi.fn();
    render(<DistanceFilter miles={20} city="San Jose" status="ready" onChange={onChange} />);
    const slider = screen.getByLabelText('Within 20 miles of San Jose');
    expect(slider).toHaveValue('20');
    fireEvent.change(slider, { target: { value: '45' } });
    expect(onChange).toHaveBeenLastCalledWith(45);
    fireEvent.change(slider, { target: { value: '105' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('reads "Any distance" at the far end', () => {
    render(<DistanceFilter miles={null} city="San Jose" status="any" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Any distance')).toHaveValue('105');
  });

  it('says so when the city is not on the map yet', () => {
    render(<DistanceFilter miles={20} city="Davis" status="unplaced" onChange={vi.fn()} />);
    expect(screen.getByText(/Davis isn't on our map yet/)).toBeInTheDocument();
  });
});
