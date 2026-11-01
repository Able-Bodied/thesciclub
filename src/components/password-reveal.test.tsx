import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordReveal } from '@/components/password-reveal';

function renderField(onSubmit = vi.fn()) {
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <PasswordReveal what="password" className="mt-2">
        {(input) => <input aria-label="Password" defaultValue="secret" {...input} />}
      </PasswordReveal>
      <PasswordReveal what="the password typed again" className="mt-2">
        {(input) => <input aria-label="Again" {...input} />}
      </PasswordReveal>
    </form>,
  );
}

describe('showing a password', () => {
  it('starts hidden, and shows and hides on a press, keeping what was typed', async () => {
    renderField();
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('secret');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('shows one field at a time, each named for its own', async () => {
    renderField();
    await userEvent.click(screen.getByRole('button', { name: 'Show the password typed again' }));
    expect(screen.getByLabelText('Again')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('never submits the form', async () => {
    const submitted = vi.fn();
    renderField(submitted);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(submitted).not.toHaveBeenCalled();
  });

  it('says the word it does, so it can be spoken', () => {
    renderField();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveTextContent('Show');
  });

  it('keeps a phone from changing a password it can now see', () => {
    renderField();
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('autocapitalize', 'none');
    expect(field).toHaveAttribute('autocorrect', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
  });

  it('leaves focus in the field when pressed', async () => {
    renderField();
    const field = screen.getByLabelText('Password');
    await userEvent.click(field);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveFocus();
  });
});
