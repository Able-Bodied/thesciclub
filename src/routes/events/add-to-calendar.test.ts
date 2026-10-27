import { describe, expect, it } from 'vitest';
import {
  calendarDates,
  calendarLocation,
  googleCalendarUrl,
  icsFor,
} from '@/routes/events/add-to-calendar';
import { makeEvent } from '@/test/factory';

describe('adding an event to a calendar', () => {
  // 7pm in California on Thursday 5 November.
  const swim = makeEvent({
    id: 'swim',
    title: 'Friday swim, adaptive lanes',
    startTime: '2026-11-06T03:00:00Z',
    endTime: '2026-11-06T04:30:00Z',
    timezone: 'America/Los_Angeles',
    allDay: false,
    location: 'Independence Pool',
    city: 'San Jose',
    state: 'CA',
    description: 'Bring a towel; the lift is on the left.',
    descriptionHtml: '',
    url: null,
  });

  it('uses UTC instants, and an hour when there is no end', () => {
    expect(calendarDates(swim)).toEqual({
      start: '20261106T030000Z',
      end: '20261106T043000Z',
      allDay: false,
    });
    expect(calendarDates({ ...swim, endTime: null }).end).toBe('20261106T040000Z');
  });

  it('gives an all-day event whole days on its own calendar, ending the day after', () => {
    const fair = {
      ...swim,
      allDay: true,
      // Midnight in California is 8am UTC in November; the end is the last day's 23:59.
      startTime: '2026-11-07T08:00:00Z',
      endTime: '2026-11-10T07:59:00Z',
    };
    expect(calendarDates(fair)).toEqual({ start: '20261107', end: '20261110', allDay: true });
  });

  it('says where, with the city, or the call link for an online event', () => {
    expect(calendarLocation(swim)).toBe('Independence Pool, San Jose, CA');
    expect(
      calendarLocation({
        ...swim,
        location: '',
        city: null,
        state: null,
        url: 'https://us02web.zoom.us/j/123',
      }),
    ).toBe('https://us02web.zoom.us/j/123');
  });

  it('makes a Google Calendar link with the event in it', () => {
    const url = new URL(googleCalendarUrl(swim));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Friday swim, adaptive lanes');
    expect(url.searchParams.get('dates')).toBe('20261106T030000Z/20261106T043000Z');
    expect(url.searchParams.get('location')).toBe('Independence Pool, San Jose, CA');
    expect(url.searchParams.get('details')).toContain('Bring a towel');
    expect(url.searchParams.get('details')).toContain('https://thesciclub.com/events/swim');
  });

  it('makes an .ics file, escaped and folded', () => {
    const ics = icsFor(swim, new Date('2026-10-27T12:00:00Z'));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('UID:swim@thesciclub.com');
    expect(lines).toContain('DTSTAMP:20261027T120000Z');
    expect(lines).toContain('DTSTART:20261106T030000Z');
    expect(lines).toContain('DTEND:20261106T043000Z');
    expect(lines).toContain('SUMMARY:Friday swim\\, adaptive lanes');
    expect(lines).toContain('LOCATION:Independence Pool\\, San Jose\\, CA');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolded, the description is whole.
    expect(ics.replace(/\r\n /g, '')).toContain('Bring a towel\\; the lift is on the left.');
  });

  it('marks an all-day event by date', () => {
    const ics = icsFor({ ...swim, allDay: true, endTime: null });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261105');
    expect(ics).toContain('DTEND;VALUE=DATE:20261106');
  });
});
