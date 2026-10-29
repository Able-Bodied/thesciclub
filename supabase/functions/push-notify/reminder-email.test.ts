import { describe, expect, it } from 'vitest';
import { reminderEmail } from './reminder-email.ts';

const due = {
  email: 'sam@example.com',
  name: 'Sam Rivera',
  title: 'Adaptive kayaking day',
  starts: 'Thursday, October 30 at 9:00 am',
  place: 'Shoreline Lake Boathouse, Mountain View',
  url: 'https://thesciclub.com/events/abc',
};

// The owner, 2026-10-28: the day-before reminder by email too.
describe('the day-before reminder email', () => {
  it('says what, when and where, links the event, and says how to stop them', () => {
    const email = reminderEmail(due);
    expect(email.to).toBe('sam@example.com');
    expect(email.subject).toBe('Tomorrow: Adaptive kayaking day');
    expect(email.text).toContain('Hi Sam,');
    expect(email.text).toContain('When: Thursday, October 30 at 9:00 am');
    expect(email.text).toContain('Where: Shoreline Lake Boathouse, Mountain View');
    expect(email.text).toContain('https://thesciclub.com/events/abc');
    expect(email.text).toContain('Email me the day before');
    expect(email.html).toContain('<a href="https://thesciclub.com/events/abc">');
  });

  it('leaves out a place it was not given, and escapes what the event says', () => {
    const email = reminderEmail({ ...due, name: null, place: null, title: 'Rugby <b>night</b>' });
    expect(email.text).toContain('Hi,');
    expect(email.text).not.toContain('Where:');
    expect(email.html).toContain('Rugby &lt;b&gt;night&lt;/b&gt;');
    expect(email.html).not.toContain('<b>night');
  });
});
