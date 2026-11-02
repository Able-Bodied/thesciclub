import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewSwitch } from '@/routes/map/view-switch';

describe('ViewSwitch', () => {
  it('shows the word only on the view that is not showing', () => {
    render(<ViewSwitch view="list" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveTextContent(/^$/);
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Map');
  });

  it('turns the other way round on the map', () => {
    render(<ViewSwitch view="map" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveTextContent('List');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent(/^$/);
  });

  it('names both for a screen reader, and changes view', async () => {
    const onChange = vi.fn();
    render(<ViewSwitch view="list" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(onChange).toHaveBeenCalledWith('map');
  });
});
