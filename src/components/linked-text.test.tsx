import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LinkedText } from '@/components/linked-text';

describe('LinkedText', () => {
  it('draws an address as a link that opens elsewhere and vouches for nothing', () => {
    render(<LinkedText text="Mine is https://www.example.com/roho-cushion, try it." />);
    const link = screen.getByRole('link', { name: 'example.com/roho-cushion' });
    expect(link).toHaveAttribute('href', 'https://www.example.com/roho-cushion');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    expect(document.body).toHaveTextContent('Mine is example.com/roho-cushion, try it.');
  });

  it('draws plain text as it is', () => {
    render(<LinkedText text="No links here." />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('No links here.')).toBeInTheDocument();
  });
});
