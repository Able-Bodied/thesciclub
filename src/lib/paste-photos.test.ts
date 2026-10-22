import { describe, expect, it, vi } from 'vitest';
import { pastedImages, pastePhotos } from '@/lib/paste-photos';

const file = (name: string, type: string) => new File(['x'], name, { type });

function transfer(
  files: File[],
  items: { kind: string; file: File | null }[] = [],
  text = '',
): DataTransfer {
  return {
    files,
    items: items.map((item) => ({ kind: item.kind, getAsFile: () => item.file })),
    getData: (type: string) => (type === 'text/plain' ? text : ''),
  } as unknown as DataTransfer;
}

describe('the pictures in a paste', () => {
  it('takes images and leaves other files out', () => {
    const picture = file('a.png', 'image/png');
    expect(pastedImages(transfer([picture, file('notes.pdf', 'application/pdf')]))).toEqual([
      picture,
    ]);
  });

  it('finds a picture listed only as an item', () => {
    const picture = file('image.png', 'image/png');
    expect(
      pastedImages(
        transfer(
          [],
          [
            { kind: 'string', file: null },
            { kind: 'file', file: picture },
          ],
        ),
      ),
    ).toEqual([picture]);
  });

  it('is nothing for words alone, or no clipboard', () => {
    expect(pastedImages(transfer([], [], 'hello'))).toEqual([]);
    expect(pastedImages(null)).toEqual([]);
  });
});

describe('pasting into a text box', () => {
  /** A paste event, and the spy on whether it was kept out of the box. */
  const event = (data: DataTransfer) => {
    const preventDefault = vi.fn();
    return {
      e: { clipboardData: data, preventDefault } as unknown as React.ClipboardEvent,
      preventDefault,
    };
  };

  it('hands the pictures over, and keeps a picture alone out of the words', () => {
    const add = vi.fn();
    const picture = file('a.png', 'image/png');
    const { e, preventDefault } = event(transfer([picture]));
    pastePhotos(e, { add });
    expect(add).toHaveBeenCalledWith([picture]);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('lets words in the same paste land as words', () => {
    const { e, preventDefault } = event(transfer([file('a.png', 'image/png')], [], 'caption'));
    pastePhotos(e, { add: vi.fn() });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does nothing where there is nowhere to put a picture', () => {
    const { e, preventDefault } = event(transfer([file('a.png', 'image/png')]));
    pastePhotos(e, null);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
