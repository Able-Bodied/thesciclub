import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetGrip } from '@/components/sheet-grip';

function Sheet({ onClose }: { onClose: () => void }) {
  const sheet = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={sheet} data-testid="sheet">
      <SheetGrip sheet={sheet} onClose={onClose} />
    </div>
  );
}

function renderSheet() {
  const closed = vi.fn();
  const { container } = render(<Sheet onClose={closed} />);
  const grip = container.querySelector<HTMLElement>('[data-sheet-grip]');
  if (!grip) throw new Error('no grip');
  const sheet = screen.getByTestId('sheet');
  vi.spyOn(sheet, 'offsetHeight', 'get').mockReturnValue(600);
  return { closed, grip, sheet };
}

const pull = (grip: HTMLElement, from: number, to: number) => {
  fireEvent.pointerDown(grip, { clientY: from, pointerId: 1 });
  fireEvent.pointerMove(grip, { clientY: to, pointerId: 1 });
};

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

describe('the bar on a sheet', () => {
  it('moves the sheet with the finger, down only', () => {
    const { grip, sheet } = renderSheet();
    pull(grip, 100, 150);
    expect(sheet.style.transform).toBe('translateY(50px)');
    fireEvent.pointerMove(grip, { clientY: 20, pointerId: 1 });
    expect(sheet.style.transform).toBe('translateY(0px)');
  });

  it('closes the sheet when pulled far enough', () => {
    const { closed, grip } = renderSheet();
    pull(grip, 100, 240);
    fireEvent.pointerUp(grip, { clientY: 240, pointerId: 1 });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('slides back from a small pull', () => {
    const { closed, grip, sheet } = renderSheet();
    pull(grip, 100, 130);
    fireEvent.pointerUp(grip, { clientY: 130, pointerId: 1 });
    expect(closed).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('');
  });

  it('does nothing for a tap', () => {
    const { closed, grip } = renderSheet();
    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 100, pointerId: 1 });
    expect(closed).not.toHaveBeenCalled();
  });
});
