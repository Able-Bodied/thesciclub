import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHideOnScroll } from '@/components/hide-on-scroll';

function Page({ enabled = true, place = '/home' }: { enabled?: boolean; place?: string }) {
  const { hidden } = useHideOnScroll(enabled, place);
  return (
    <>
      <p>{hidden ? 'Hidden' : 'Showing'}</p>
      <div data-testid="box" />
    </>
  );
}

function scrollTo(box: HTMLElement, top: number, height = 2000) {
  Object.defineProperty(box, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(box, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty(box, 'scrollTop', { value: top, configurable: true });
  fireEvent.scroll(box);
}

describe('the tab bar on a scroll', () => {
  it('goes on the way down, and comes back on the way up', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    scrollTo(box, 200);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('ignores a finger settling', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    scrollTo(box, 296);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('always shows near the top', () => {
    render(<Page />);
    const box = screen.getByTestId('box');
    scrollTo(box, 300);
    scrollTo(box, 20);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('stays for a page too short to gain from it', () => {
    render(<Page />);
    scrollTo(screen.getByTestId('box'), 90, 700);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('comes back on a new screen', () => {
    const { rerender } = render(<Page />);
    scrollTo(screen.getByTestId('box'), 300);
    rerender(<Page place="/peers" />);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('does nothing where it is off', () => {
    render(<Page enabled={false} />);
    scrollTo(screen.getByTestId('box'), 300);
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });
});
