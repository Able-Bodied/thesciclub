import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlaceContact } from '@/routes/events/place-contact';
import type { OrganizationPlace } from '@/types/domain';

const place = (over: Partial<OrganizationPlace> = {}): OrganizationPlace => ({
  id: 'p1',
  position: 0,
  label: 'Denver',
  address: null,
  city: 'Denver',
  state: 'CO',
  postalCode: null,
  note: 'Chapter Coordinator: Lorraine\nlorraine@teamriverrunner.org',
  url: 'https://www.teamriverrunner.org/get-involved/chapters/colorado-denver/',
  ...over,
});

describe('who to contact at a place', () => {
  it('says each line of its note and links its own page', () => {
    render(<PlaceContact place={place()} />);
    expect(screen.getByText('Denver')).toBeInTheDocument();
    expect(screen.getByText('Chapter Coordinator: Lorraine')).toBeInTheDocument();
    expect(screen.getByText('lorraine@teamriverrunner.org')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open Denver’s page/ });
    expect(link).toHaveAttribute('href', place().url);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows nothing for a place with neither', () => {
    const { container } = render(<PlaceContact place={place({ note: null, url: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('never links a page that is not https', () => {
    render(<PlaceContact place={place({ url: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
