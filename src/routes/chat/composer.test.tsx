import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@/routes/chat/composer';

/**
 * What the composer hands over, and when it will not. Object URLs are stubbed
 * because jsdom has none; the strip is asserted by its controls, not its
 * pictures.
 */
beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:preview',
    revokeObjectURL: () => undefined,
  });
});

const photo = (name: string, size = 100, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], name, { type });

// The input is the platform's own picker behind the button, hidden from the
// accessibility tree on purpose — the button is the control. Reached by its
// type rather than by a label it deliberately does not have.
const fileInput = (): HTMLInputElement => {
  const element = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!element) throw new Error('the composer should carry a file input');
  return element;
};

type OnSend = (body: string, files: File[]) => Promise<string | null>;

function renderComposer(onSend = vi.fn<OnSend>(() => Promise.resolve(null))) {
  render(
    <Composer placeholder="Message Bo" sendLabel="Send this message" onSend={onSend} sendOnEnter />,
  );
  return onSend;
}

describe('the composer', () => {
  it('will not send nothing', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: 'Send this message' })).toBeDisabled();
  });

  it('sends the words with no photographs', async () => {
    const onSend = renderComposer();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'Hello{Enter}');
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('Hello', []);
    });
  });

  // Words are optional once there is a photograph — the row's own check says
  // words *or* a picture.
  it('sends a photograph alone, and clears the strip once it has gone', async () => {
    const onSend = renderComposer();
    const user = userEvent.setup();
    const file = photo('cushion.jpg');
    await user.upload(fileInput(), file);
    expect(screen.getByRole('button', { name: 'Take back cushion.jpg' })).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send this message' });
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('', [file]);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Take back/ })).toBeNull();
    });
  });

  it('takes a chosen photograph back before it is sent', async () => {
    const onSend = renderComposer();
    const user = userEvent.setup();
    await user.upload(fileInput(), [photo('a.jpg'), photo('b.jpg')]);
    await user.click(screen.getByRole('button', { name: 'Take back a.jpg' }));
    expect(screen.queryByRole('button', { name: 'Take back a.jpg' })).toBeNull();
    await user.type(screen.getByRole('textbox'), 'One left{Enter}');
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    const [, files] = onSend.mock.calls[0] as unknown as [string, File[]];
    expect(files.map((f) => f.name)).toEqual(['b.jpg']);
  });

  it('refuses a fifth photograph in a sentence, and keeps the four', async () => {
    renderComposer();
    const user = userEvent.setup();
    const input = fileInput();
    await user.upload(input, [photo('1.jpg'), photo('2.jpg'), photo('3.jpg'), photo('4.jpg')]);
    expect(screen.getAllByRole('button', { name: /Take back/ })).toHaveLength(4);
    // The button says why it is unavailable rather than going quiet.
    expect(screen.getByRole('button', { name: '4 photographs is the most' })).toBeDisabled();
  });

  it('refuses a video in a sentence that says what to do instead', () => {
    renderComposer();
    // Not user.upload: userEvent honours the input's `accept` and drops the
    // file before the picker sees it, and the picker's own check — for a
    // browser or a phone that offers the file anyway — is what is under test.
    fireEvent.change(fileInput(), { target: { files: [photo('clip.mp4', 10, 'video/mp4')] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/not a photograph.*video can be linked/);
    expect(screen.queryByRole('button', { name: /Take back/ })).toBeNull();
  });

  it('keeps the words and the photographs when the send is refused', async () => {
    const onSend = vi.fn<OnSend>(() => Promise.resolve('The room closed while you typed.'));
    renderComposer(onSend);
    const user = userEvent.setup();
    await user.upload(fileInput(), photo('a.jpg'));
    await user.type(screen.getByRole('textbox'), 'Still here{Enter}');
    await waitFor(() => {
      expect(screen.getByText(/The room closed while you typed/)).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox')).toHaveValue('Still here');
    expect(screen.getByRole('button', { name: 'Take back a.jpg' })).toBeInTheDocument();
  });
});
