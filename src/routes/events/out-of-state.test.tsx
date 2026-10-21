import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const home = vi.hoisted((): { state: string | null } => ({ state: 'CA' }));
vi.mock('@/lib/home-state', () => ({ useHomeState: () => home.state }));

const { OutOfStateMark } = await import('@/routes/events/out-of-state');

describe('the out-of-state mark', () => {
  it('names the state of an event outside the member’s own', () => {
    home.state = 'CA';
    render(<OutOfStateMark state="GA" />);
    expect(screen.getByText('Out of state · Georgia')).toBeInTheDocument();
  });

  it('says nothing at home, online, or when the member’s state is unknown', () => {
    home.state = 'CA';
    const { container, rerender } = render(<OutOfStateMark state="CA" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<OutOfStateMark state={null} />);
    expect(container).toBeEmptyDOMElement();
    home.state = null;
    rerender(<OutOfStateMark state="GA" />);
    expect(container).toBeEmptyDOMElement();
  });
});
