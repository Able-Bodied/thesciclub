import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { AnnounceProvider } from '@/lib/announce';
import type { JoiningSetting } from '@/lib/joining';
import { JoiningSection } from '@/routes/admin/joining-section';

const save = vi.hoisted(() => vi.fn());
vi.mock('@/lib/joining', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setJoiningOpen: save,
}));

let confirmSpy: MockInstance<typeof window.confirm>;

function renderSection(setting: JoiningSetting | null, error: string | null = null) {
  const onChanged = vi.fn();
  render(
    <AnnounceProvider>
      <JoiningSection setting={setting} error={error} onChanged={onChanged} />
    </AnnounceProvider>,
  );
  return onChanged;
}

const closed: JoiningSetting = { open: false, changedAt: null };
const open: JoiningSetting = { open: true, changedAt: '2026-10-14T17:00:00Z' };

beforeEach(() => {
  save.mockReset();
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  confirmSpy.mockClear();
});

describe('who can join', () => {
  it('says invite only, with the switch off', () => {
    renderSection(closed);
    expect(screen.getByRole('switch', { name: 'Anybody can join' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText(/^Invite only\./)).toBeInTheDocument();
  });

  it('says since when it has been open, with the switch on', () => {
    renderSection(open);
    expect(screen.getByRole('switch', { name: 'Anybody can join' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/Anybody can join since October 14, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Blocked addresses still cannot/)).toBeInTheDocument();
  });

  it('asks before opening, and does nothing on Cancel', async () => {
    confirmSpy.mockReturnValue(false);
    const onChanged = renderSection(closed);
    await userEvent.click(screen.getByRole('switch', { name: 'Anybody can join' }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('opens on OK and reads the setting again', async () => {
    save.mockResolvedValue({ ok: true });
    const onChanged = renderSection(closed);
    await userEvent.click(screen.getByRole('switch', { name: 'Anybody can join' }));
    expect(save).toHaveBeenCalledWith(true);
    expect(onChanged).toHaveBeenCalled();
  });

  it('closes without asking', async () => {
    save.mockResolvedValue({ ok: true });
    const onChanged = renderSection(open);
    await userEvent.click(screen.getByRole('switch', { name: 'Anybody can join' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(false);
    expect(onChanged).toHaveBeenCalled();
  });

  it('says why a change was refused', async () => {
    save.mockResolvedValue({ ok: false, error: 'Only an administrator can do that.' });
    const onChanged = renderSection(open);
    await userEvent.click(screen.getByRole('switch', { name: 'Anybody can join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an administrator');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('says so when the setting could not be read', () => {
    renderSection(null, 'Could not check who can join.');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Could not check who can join.')).toBeInTheDocument();
  });
});
