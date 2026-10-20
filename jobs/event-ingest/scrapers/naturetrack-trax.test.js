import { describe, expect, it } from 'vitest';
import { containsContactDetails } from '../classify.js';
import { nearestYear, parseHours, parseMonthDay, parseSchedule } from './naturetrack-trax.js';

const outing = (place, date, hours) => `
  <div class="elementor-element elementor-widget elementor-widget-icon-list">
    <div class="elementor-widget-container"><ul class="elementor-icon-list-items">
      <li class="elementor-icon-list-item"><a href="https://maps.app.goo.gl/x"><span class="elementor-icon-list-text">${place}</span></a></li>
      <li class="elementor-icon-list-item"><span class="elementor-icon-list-text">${date}</span></li>
      <li class="elementor-icon-list-item"><span class="elementor-icon-list-text">${hours}</span></li>
    </ul></div>
  </div>`;

// The live page's shape on 2026-10-20, classes trimmed.
const page = (outings, heading = 'NatureTrack Monthly Freedom Trax Schedule') => `
  <div class="elementor-element e-con e-parent"><div class="e-con-inner">
    <div class="elementor-element elementor-widget elementor-widget-heading">
      <div class="elementor-widget-container"><h2>${heading}</h2></div>
    </div>
    <div class="elementor-element elementor-widget"><p>For more information contact Abby</p></div>
  </div></div>
  <div class="elementor-element e-con e-parent"><div class="e-con-inner">${outings}</div></div>
  <div class="elementor-element e-con e-parent"><div class="e-con-inner">
    <a class="elementor-button elementor-hidden-desktop elementor-hidden-mobile" href="https://naturetrack.org/monthly-trax-outdoor-adventures/"><span>REGISTER (monthly)</span></a>
    <a class="elementor-button" href="https://naturetrack.org/borrow-a-freedom-trax/"><span>Borrow a Freedom Trax</span></a>
    <div class="elementor-element"><h2>NatureTrack Group Freedom Trax</h2></div>
    ${outing('Group outing', 'December 5th', '10-2')}
  </div></div>`;

const now = new Date('2026-10-20T19:00:00Z');

describe('parseSchedule', () => {
  const events = parseSchedule(
    page(
      outing('Rincon Beach Life Rolls on', 'October 3rd', '10-3') +
        outing('Leadbetter Beach', 'October 24th', '11-3') +
        outing('Rincon Beach', 'November 21st', '10-2'),
    ),
    now,
  );

  it('reads each outing with its Pacific hours, across the change back to standard time', () => {
    expect(events.map((e) => [e.title, e.start_time, e.end_time])).toEqual([
      [
        'Freedom Trax at Rincon Beach Life Rolls on',
        '2026-10-03T17:00:00.000Z',
        '2026-10-03T22:00:00.000Z',
      ],
      ['Freedom Trax at Leadbetter Beach', '2026-10-24T18:00:00.000Z', '2026-10-24T22:00:00.000Z'],
      ['Freedom Trax at Rincon Beach', '2026-11-21T18:00:00.000Z', '2026-11-21T22:00:00.000Z'],
    ]);
  });

  it('stops at the next heading, so the group outings are not read as events', () => {
    expect(events.some((e) => e.title.includes('Group'))).toBe(false);
  });

  it('sends RSVPs to the Borrow form, not the hidden REGISTER button', () => {
    expect(events[1].registration_url).toBe('https://naturetrack.org/borrow-a-freedom-trax/');
    expect(events[1].description_html).toContain(
      'href="https://naturetrack.org/borrow-a-freedom-trax/"',
    );
  });

  it('keys each outing by its date, and names NatureTrack as host', () => {
    expect(events[1].external_id).toBe('naturetrack-trax-2026-10-24');
    expect(events[1].host_name).toBe('NatureTrack');
    expect(events[1].location).toBe('Leadbetter Beach California');
  });

  it('carries no phone number or email, so no event waits for review', () => {
    expect(containsContactDetails(events[1].description, events[1].description_html)).toBe(false);
  });

  it('leaves an outing with no readable hours without a start time, for ingest to drop', () => {
    const [event] = parseSchedule(page(outing('Leadbetter Beach', 'October 24th', 'TBD')), now);
    expect(event.start_time).toBeNull();
  });

  it('throws when the schedule heading is gone, so the run goes red', () => {
    expect(() => parseSchedule(page('', 'Upcoming'), now)).toThrow(/heading is gone/);
  });

  it('throws when there are outings but none can be read', () => {
    expect(() => parseSchedule(page(outing('Somewhere', 'soon', '10-2')), now)).toThrow(
      /none could be read/,
    );
  });

  it('returns nothing, without throwing, when the schedule is empty', () => {
    expect(parseSchedule(page(''), now)).toEqual([]);
  });
});

describe('nearestYear', () => {
  it('keeps a recent past date in this year', () => {
    expect(nearestYear({ month: 10, day: 3 }, now)).toBe(2026);
  });

  it('puts January, read in December, in the next year', () => {
    expect(nearestYear({ month: 1, day: 9 }, new Date('2026-12-15T00:00:00Z'))).toBe(2027);
  });
});

describe('parseMonthDay', () => {
  it('reads ordinals and short months', () => {
    expect(parseMonthDay('October 24th')).toEqual({ month: 10, day: 24 });
    expect(parseMonthDay('Nov. 1')).toEqual({ month: 11, day: 1 });
    expect(parseMonthDay('soon')).toBeNull();
  });
});

describe('parseHours', () => {
  it('reads bare hours as a daytime outing', () => {
    expect(parseHours('11-3')).toEqual({ start: 660, end: 900 });
    expect(parseHours('10:30 – 1')).toEqual({ start: 630, end: 780 });
  });

  it('honours am and pm when given', () => {
    expect(parseHours('9am-12pm')).toEqual({ start: 540, end: 720 });
  });

  it('refuses hours that end before they start', () => {
    expect(parseHours('3-11')).toBeNull();
  });
});
