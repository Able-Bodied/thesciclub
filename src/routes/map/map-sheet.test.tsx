import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapSheet } from '@/routes/map/map-sheet';

function renderSheet() {
  const closed = vi.fn();
  render(
    <MapSheet title="2 events here" onClose={closed}>
      <p>Rugby</p>
    </MapSheet>,
  );
  return { closed, handle: screen.getByRole('button', { name: 'Minimize' }) };
}

const dialog = () => screen.getByRole('dialog', { name: '2 events here' });
const offset = () => dialog().style.getPropertyValue('--sheet-down');

function drag(handle: HTMLElement, from: number, ...to: number[]) {
  fireEvent.pointerDown(handle, { clientY: from, pointerId: 1 });
  for (const y of to) fireEvent.pointerMove(handle, { clientY: y, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientY: to.at(-1) ?? from, pointerId: 1 });
  fireEvent.click(handle);
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  // A sheet 400 tall, of which the handle and title are 60.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height(
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'dialog' ? 400 : 60;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the sheet on a map', () => {
  it('opens over a dimmed map, all of it showing', () => {
    renderSheet();
    expect(offset()).toBe('0px');
    expect(screen.getByRole('button', { name: 'Back to the map', hidden: true })).toBeTruthy();
  });

  it('follows the handle, and goes no higher than open or lower than its title', () => {
    const { handle } = renderSheet();
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 150, pointerId: 1 });
    expect(offset()).toBe('50px');
    fireEvent.pointerMove(handle, { clientY: 900, pointerId: 1 });
    expect(offset()).toBe('340px');
    fireEvent.pointerMove(handle, { clientY: 0, pointerId: 1 });
    expect(offset()).toBe('0px');
  });

  it('minimizes when dragged down, leaving its title and the map free', () => {
    const { handle } = renderSheet();
    drag(handle, 100, 300);
    expect(offset()).toBe('calc(100% - 60px)');
    expect(screen.queryByRole('button', { name: 'Back to the map', hidden: true })).toBeNull();
    expect(dialog().getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('button', { name: 'Show all of this' })).toBeTruthy();
    expect(screen.getByText('Rugby').parentElement?.hasAttribute('inert')).toBe(true);
  });

  it('can be held by the strip beside its title, but not by ✕', () => {
    renderSheet();
    const heading = screen.getByRole('heading', { name: '2 events here' });
    fireEvent.pointerDown(heading, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(heading, { clientY: 150, pointerId: 1 });
    expect(offset()).toBe('50px');
    fireEvent.pointerUp(heading, { clientY: 100, pointerId: 1 });
    const close = screen.getByRole('button', { name: 'Close' });
    fireEvent.pointerDown(close, { clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(close, { clientY: 300, pointerId: 2 });
    expect(offset()).toBe('0px');
  });

  it('settles back open on a small drag', () => {
    const { handle } = renderSheet();
    drag(handle, 100, 150);
    expect(offset()).toBe('0px');
  });

  it('comes back when dragged up', () => {
    const { handle } = renderSheet();
    drag(handle, 100, 300);
    drag(handle, 500, 300);
    expect(offset()).toBe('0px');
  });

  it('minimizes and comes back on a tap or the keyboard, not for a finger barely moved', async () => {
    const { handle } = renderSheet();
    drag(handle, 100, 102);
    expect(offset()).toBe('calc(100% - 60px)');
    handle.focus();
    await userEvent.keyboard('{Enter}');
    expect(offset()).toBe('0px');
    expect(handle.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on ✕, minimized or not', async () => {
    const { closed, handle } = renderSheet();
    drag(handle, 100, 300);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toHaveBeenCalled();
  });
});
