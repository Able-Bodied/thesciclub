import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationSummarySetting } from '@/routes/events/organization-summary-setting';

const api = vi.hoisted(() => ({
  saved: [] as string[],
  refusal: null as string | null,
  reloads: 0,
}));

vi.mock('@/lib/organization-members', () => ({
  setOrganizationSummary: (_id: string, summary: string) => {
    api.saved.push(summary);
    return Promise.resolve(api.refusal ? { ok: false, error: api.refusal } : { ok: true });
  },
}));
vi.mock('@/lib/organizations', () => ({
  useOrganizations: () => ({
    reload: () => {
      api.reloads++;
    },
  }),
}));

beforeEach(() => {
  api.saved = [];
  api.refusal = null;
  api.reloads = 0;
});

describe('the card description', () => {
  it('saves what is typed, and reads the directory again', async () => {
    render(<OrganizationSummarySetting organizationId="o" summary="Old line" />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    const input = screen.getByLabelText('Card description');
    await userEvent.clear(input);
    await userEvent.type(input, ' New line ');
    await userEvent.click(save);
    expect(api.saved).toEqual(['New line']);
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
    expect(api.reloads).toBe(1);
  });

  it('says why it was not saved', async () => {
    api.refusal = 'That was not saved. Try again.';
    render(<OrganizationSummarySetting organizationId="o" summary={null} />);
    await userEvent.type(screen.getByLabelText('Card description'), 'A line');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not saved');
  });
});
