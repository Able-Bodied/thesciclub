import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CoverChange } from '@/lib/events';

/**
 * Choosing an event's cover picture. Nothing is uploaded here — the form does
 * that once the event is saved — so this is what the field records.
 */

vi.mock('@/lib/photos', () => ({
  usePhotoUrl: (path: string | null) => (path ? `https://signed.example/${path}` : null),
}));

const { CoverField } = await import('@/routes/events/cover-field');

beforeAll(() => {
  // jsdom has no object URLs; the preview only needs one to exist.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

let last: CoverChange | null = null;

function Harness({ initial }: { initial: CoverChange }) {
  const [value, setValue] = useState(initial);
  return (
    <CoverField
      value={value}
      onChange={(next) => {
        last = next;
        setValue(next);
      }}
      labelClassName=""
      hintClassName=""
      fieldClassName=""
    />
  );
}

const fileInput = (): HTMLInputElement => {
  const element = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!element) throw new Error('the field should carry a file input');
  return element;
};
const photo = new File([new Uint8Array(10)], 'flyer.jpg', { type: 'image/jpeg' });

describe('CoverField', () => {
  it('offers a picture when there is none, and records the one chosen', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ kind: 'keep', path: null, alt: '' }} />);
    expect(screen.getByRole('button', { name: 'Add a picture' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Describe the picture/ })).toBeNull();
    await user.upload(fileInput(), photo);
    expect(last).toMatchObject({ kind: 'new', file: photo });
    await user.type(screen.getByRole('textbox', { name: /Describe the picture/ }), 'The flyer');
    expect(last).toMatchObject({ kind: 'new', alt: 'The flyer' });
  });

  it('refuses a file that is not a picture, and says why', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness initial={{ kind: 'keep', path: null, alt: '' }} />);
    await user.upload(fileInput(), new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toHaveTextContent('is not a photograph');
  });

  it('shows the picture an event has, and takes it off', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ kind: 'keep', path: 'events/e1/a.webp', alt: 'The patio' }} />);
    expect(screen.getByRole('textbox', { name: /Describe the picture/ })).toHaveValue('The patio');
    await user.click(screen.getByRole('button', { name: 'Remove picture' }));
    expect(last).toEqual({ kind: 'remove' });
    expect(screen.getByRole('button', { name: 'Add a picture' })).toBeInTheDocument();
  });
});
