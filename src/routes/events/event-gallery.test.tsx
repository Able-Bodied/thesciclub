import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventGallery } from '@/routes/events/event-gallery';
import { MorePicturesField } from '@/routes/events/more-pictures-field';

vi.mock('@/lib/photos', () => ({
  PHOTOS_BUCKET: 'photos',
  usePhotoUrl: (path: string | null) => (path ? `https://x/${path}` : null),
}));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map(paths.map((path) => [path, `https://x/${path}`])),
}));

const more = [
  { path: 'events/e/b.webp', alt: 'The ramp' },
  { path: 'events/e/c.webp', alt: '' },
];

describe('an event’s pictures', () => {
  it('shows the cover large, and another once it is pressed', async () => {
    render(<EventGallery path="events/e/a.webp" alt="The patio" more={more} />);
    expect(screen.getByRole('img', { name: 'The patio' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /picture 2 of 3: The ramp/ }));
    expect(screen.getByRole('img', { name: 'The ramp' })).toHaveAttribute(
      'src',
      'https://x/events/e/b.webp',
    );
    expect(screen.getByRole('button', { name: /picture 2 of 3/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('has no row for one picture', () => {
    render(<EventGallery path="events/e/a.webp" alt="The patio" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws nothing with no pictures', () => {
    const { container } = render(<EventGallery path={null} alt={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the others when there is no cover', () => {
    render(<EventGallery path={null} alt={null} more={more} />);
    expect(screen.getByRole('img', { name: 'The ramp' })).toBeInTheDocument();
  });
});

describe('the form’s other pictures', () => {
  const field = (value: Parameters<typeof MorePicturesField>[0]['value'], onChange = vi.fn()) => {
    render(
      <MorePicturesField
        value={value}
        onChange={onChange}
        labelClassName=""
        hintClassName=""
        fieldClassName=""
      />,
    );
    return onChange;
  };

  it('takes one off', async () => {
    const onChange = field([
      { kind: 'keep', path: 'events/e/b.webp', alt: '' },
      { kind: 'keep', path: 'events/e/c.webp', alt: '' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove picture 1' }));
    expect(onChange).toHaveBeenCalledWith([{ kind: 'keep', path: 'events/e/c.webp', alt: '' }]);
  });

  it('stops offering more at the limit', () => {
    field(
      Array.from({ length: 6 }, (_, i) => ({
        kind: 'keep' as const,
        path: `events/e/${String(i)}.webp`,
        alt: '',
      })),
    );
    expect(screen.queryByRole('button', { name: 'Add more pictures' })).toBeNull();
  });
});
