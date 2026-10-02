import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterSheet, type FilterSheetProps, TOPICS_SHOWN } from '@/routes/peers/filter-sheet';
import { EMPTY_MEMBER_FILTERS } from '@/types/domain';

const topics = (n: number) => Array.from({ length: n }, (_, i) => `Topic ${i + 1}`);

function renderSheet(overrides: Partial<FilterSheetProps> = {}) {
  const props: FilterSheetProps = {
    regions: [],
    cities: [],
    topics: topics(30),
    filters: EMPTY_MEMBER_FILTERS,
    matchCount: 5,
    activeCount: 0,
    onChange: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<FilterSheet {...props} />);
  return props;
}

const topicChips = () => screen.getAllByRole('button', { name: /^Topic \d+$/ });

describe('the topics on the Peers filter', () => {
  it('draws the most common ones and offers the rest', () => {
    renderSheet();
    expect(topicChips()).toHaveLength(TOPICS_SHOWN);
    expect(screen.getByRole('button', { name: 'Show all 30 topics' })).toBeInTheDocument();
  });

  // Until 2026-10-01 a topic past the first 24 could not be ticked at all.
  it('shows every topic when asked, and puts focus on the first new one', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 30 topics' }));
    expect(topicChips()).toHaveLength(30);
    expect(screen.getByRole('button', { name: `Topic ${TOPICS_SHOWN + 1}` })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('always draws a ticked topic, wherever it falls', () => {
    renderSheet({ filters: { ...EMPTY_MEMBER_FILTERS, topics: ['Topic 29'] } });
    expect(screen.getByRole('button', { name: 'Topic 29' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Show all 30 topics' })).toBeInTheDocument();
  });

  it('offers nothing more when every topic already fits', () => {
    renderSheet({ topics: topics(TOPICS_SHOWN) });
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });
});
