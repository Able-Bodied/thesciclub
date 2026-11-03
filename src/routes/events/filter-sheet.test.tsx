import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventFilterSheet, type EventFilterSheetProps } from '@/routes/events/filter-sheet';
import { makeOrganization } from '@/test/factory';
import { EMPTY_EVENT_FILTERS } from '@/types/domain';

function sheet(props: Partial<EventFilterSheetProps>) {
  const onChange = vi.fn();
  render(
    <EventFilterSheet
      tags={[]}
      formats={['in_person', 'online', 'hybrid']}
      organizations={[]}
      following={new Set()}
      home={{ city: 'San Jose', status: 'ready' }}
      filters={EMPTY_EVENT_FILTERS}
      rsvp={null}
      onRsvpChange={vi.fn()}
      matchCount={3}
      activeCount={0}
      onChange={onChange}
      onClear={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return onChange;
}

describe('Hosted by', () => {
  it('offers the member’s own organizations by that name, even one', async () => {
    const onChange = sheet({
      organizations: [
        makeOrganization({ id: 'ncs', name: 'NorCal SCI' }),
        makeOrganization({ id: 'borp', name: 'BORP' }),
      ],
      following: new Set(['ncs']),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Your organizations' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_EVENT_FILTERS, organizations: ['ncs'] });
  });
});
