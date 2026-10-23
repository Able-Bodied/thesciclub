import { describe, expect, it } from 'vitest';
import { eventMeetingLink } from '@/routes/events/event-meeting-link';

const NORCAL = 'https://norcalsci.org/events/friday-happy-hour';
const ZOOM = 'https://us02web.zoom.us/j/86004299187';

function event(over: { url?: string | null; description?: string; descriptionHtml?: string }) {
  return { url: NORCAL, description: '', descriptionHtml: '', ...over };
}

describe('eventMeetingLink', () => {
  it('finds the Zoom link in an anchor of the description, beside an ordinary url', () => {
    expect(
      eventMeetingLink(
        event({
          descriptionHtml: `<p>To join this Zoom meeting, <a href="${ZOOM}">CLICK HERE</a></p>`,
        }),
      ),
    ).toEqual({ href: ZOOM, service: 'Zoom', inUrl: false });
  });

  it('finds a bare address in the plain text', () => {
    expect(eventMeetingLink(event({ description: `Join us at ${ZOOM}.` }))?.href).toBe(ZOOM);
  });

  it('uses the url when it is the meeting link', () => {
    expect(
      eventMeetingLink(
        event({ url: 'https://meet.google.com/abc-defg-hij', description: `Or ${ZOOM}` }),
      ),
    ).toEqual({
      href: 'https://meet.google.com/abc-defg-hij',
      service: 'Google Meet',
      inUrl: true,
    });
  });

  it('is null when the description has only ordinary links', () => {
    expect(
      eventMeetingLink(
        event({ descriptionHtml: '<p><a href="https://example.org/rsvp">RSVP</a></p>' }),
      ),
    ).toBeNull();
  });

  it('ignores a look-alike host', () => {
    expect(
      eventMeetingLink(
        event({
          descriptionHtml: '<a href="https://zoom.us.evil.com/j/1">Join</a>',
          description: 'https://evilzoom.us/j/1 and https://example.com/?u=https://zoom.us/j/2',
        }),
      ),
    ).toBeNull();
  });

  it('uses the first of several meeting links', () => {
    expect(
      eventMeetingLink(
        event({
          descriptionHtml: `<p><a href="https://example.org/">Site</a> <a href="https://whereby.com/club">Whereby</a> <a href="${ZOOM}">Zoom</a></p>`,
        }),
      )?.service,
    ).toBe('Whereby');
  });
});
