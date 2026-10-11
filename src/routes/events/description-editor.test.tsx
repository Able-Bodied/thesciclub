import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  DescriptionEditor,
  insertLink,
  prefixLines,
  wrap,
} from '@/routes/events/description-editor';

describe('the toolbar edits', () => {
  it('wraps the selection, keeping its edge spaces outside the markers', () => {
    expect(wrap('Bring water', 6, 11, '**', 'bold words')).toEqual({
      value: 'Bring **water**',
      start: 8,
      end: 13,
    });
    expect(wrap('Bring water ', 5, 12, '*', 'x').value).toBe('Bring *water* ');
  });

  it('puts in an example to type over when nothing is selected', () => {
    expect(wrap('Hi ', 3, 3, '**', 'bold words')).toEqual({
      value: 'Hi **bold words**',
      start: 5,
      end: 15,
    });
  });

  it('starts each selected line with a heading, a bullet, or a number', () => {
    expect(prefixLines('Water\nGloves', 0, 12, () => '- ', 'x').value).toBe('- Water\n- Gloves');
    expect(prefixLines('Park\nRoll in', 0, 12, (n) => `${n}. `, 'x').value).toBe(
      '1. Park\n2. Roll in',
    );
    expect(prefixLines('Intro\nWhat to bring', 8, 8, () => '## ', 'x').value).toBe(
      'Intro\n## What to bring',
    );
  });

  it('puts an example on an empty line', () => {
    expect(prefixLines('Intro\n', 6, 6, () => '- ', 'List item')).toEqual({
      value: 'Intro\n- List item',
      start: 8,
      end: 17,
    });
  });

  it('makes the selection a link, or the address its own words', () => {
    expect(insertLink('Sign up here', 0, 7, 'https://norcalsci.org/signup').value).toBe(
      '[Sign up](https://norcalsci.org/signup) here',
    );
    expect(insertLink('', 0, 0, 'https://norcalsci.org').value).toBe(
      '[norcalsci.org](https://norcalsci.org)',
    );
  });
});

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="d">About it</label>
      <DescriptionEditor
        id="d"
        value={value}
        maxLength={4000}
        placeholder=""
        hintClassName=""
        onChange={setValue}
      />
    </>
  );
}

describe('DescriptionEditor', () => {
  it('bolds the words selected in the box', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Bring water" />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'About it' });
    box.setSelectionRange(6, 11);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(box).toHaveValue('Bring **water**');
  });

  it('asks for the address beside the toolbar, and refuses something that is not one', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Sign up" />);
    const box = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'About it' });
    box.setSelectionRange(0, 7);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const field = screen.getByRole('textbox', { name: 'Web address' });
    await user.type(field, 'not a link');
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Type a web address');
    await user.clear(field);
    await user.type(field, 'norcalsci.org/signup{Enter}');
    expect(box).toHaveValue('[Sign up](https://norcalsci.org/signup)');
  });

  it('previews what members will see', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'## What to bring\n- Water'} />);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview.querySelector('h3')).toHaveTextContent('What to bring');
    expect(preview.querySelector('li')).toHaveTextContent('Water');
  });
});
