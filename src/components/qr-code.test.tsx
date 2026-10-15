import { render, screen } from '@testing-library/react';
import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { QrCode, qrPath } from '@/components/qr-code';

const URL_TEXT = 'https://thesciclub.com/join?from=0123456789abcdef01234567';

describe('the QR code', () => {
  it('draws every dark module of the library’s code, inside a four-module quiet zone', () => {
    const qr = qrcode(0, 'M');
    qr.addData(URL_TEXT);
    qr.make();
    const count = qr.getModuleCount();
    let dark = 0;
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) dark++;

    const { size, path } = qrPath(URL_TEXT);
    expect(size).toBe(count + 8);
    expect(path.match(/M/g)?.length).toBe(dark);
    // The top-left finder pattern starts at the quiet zone's edge.
    expect(path.startsWith('M4 4h1v1h-1z')).toBe(true);
  });

  it('differs for a different code', () => {
    expect(qrPath(URL_TEXT).path).not.toBe(qrPath(`${URL_TEXT}x`).path);
  });

  it('is an image with a name a screen reader can say', () => {
    render(<QrCode text={URL_TEXT} label="QR code that opens the club's join page" />);
    expect(
      screen.getByRole('img', { name: "QR code that opens the club's join page" }),
    ).toBeInTheDocument();
  });
});
