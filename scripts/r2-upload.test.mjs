// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signedHeaders, uploadFile } from './r2-upload.mjs';

describe('signedHeaders', () => {
  // AWS's own worked example: "GET Object" in the S3 Signature V4 documentation.
  it("matches AWS's published example", () => {
    const headers = signedHeaders({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: { Range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });
});

/** Just enough of R2's S3 API, in-process (tests may not use the network). */
function fakeR2() {
  const objects = new Map();
  const uploads = new Map();
  const seen = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    const key = url.pathname;
    const method = init.method ?? 'GET';
    const body = init.body ? Buffer.from(init.body) : Buffer.alloc(0);
    seen.push(`${method} ${url.pathname}${url.search}`);
    if (!/^AWS4-HMAC-SHA256 Credential=key-id\//.test(init.headers?.authorization ?? '')) {
      return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
    }
    if (method === 'HEAD') {
      const object = objects.get(key);
      return object
        ? new Response(null, { status: 200, headers: { 'content-length': String(object.length) } })
        : new Response(null, { status: 404 });
    }
    if (method === 'PUT' && url.searchParams.has('partNumber')) {
      const number = url.searchParams.get('partNumber');
      uploads.get(url.searchParams.get('uploadId')).set(Number(number), body);
      return new Response(null, { status: 200, headers: { etag: `"part-${number}"` } });
    }
    if (method === 'PUT') {
      objects.set(key, body);
      return new Response(null, { status: 200 });
    }
    if (method === 'POST' && url.searchParams.has('uploads')) {
      uploads.set('u1', new Map());
      return new Response('<Result><UploadId>u1</UploadId></Result>', { status: 200 });
    }
    if (method === 'POST') {
      const parts = uploads.get(url.searchParams.get('uploadId'));
      const listed = [
        ...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>"part-\d+"<\/ETag>/g),
      ];
      objects.set(key, Buffer.concat(listed.map(([, number]) => parts.get(Number(number)))));
      return new Response('<CompleteMultipartUploadResult/>', { status: 200 });
    }
    return new Response(null, { status: 400 });
  };
  return { fetch, objects, seen };
}

describe('uploadFile', () => {
  const r2 = fakeR2();
  const endpoint = 'https://account.r2.cloudflarestorage.com';
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'r2-upload-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const credentials = { accessKeyId: 'key-id', secretAccessKey: 'secret', fetch: r2.fetch };

  it('sends a big file in parts that put it back together', async () => {
    const file = path.join(dir, 'ca-20261025.pmtiles');
    const bytes = Buffer.from(Array.from({ length: 2500 }, (_, i) => i % 251));
    await writeFile(file, bytes);
    const result = await uploadFile({
      endpoint,
      bucket: 'sciclub-tiles',
      key: 'ca-20261025.pmtiles',
      file,
      partSize: 1000,
      ...credentials,
    });
    expect(result).toBe('uploaded');
    expect(r2.objects.get('/sciclub-tiles/ca-20261025.pmtiles')).toEqual(bytes);
    expect(r2.seen.filter((line) => line.includes('partNumber='))).toHaveLength(3);
  });

  it('skips a file already there at the same size', async () => {
    const file = path.join(dir, 'ca-20261025.pmtiles');
    const before = r2.seen.length;
    const result = await uploadFile({
      endpoint,
      bucket: 'sciclub-tiles',
      key: 'ca-20261025.pmtiles',
      file,
      partSize: 1000,
      ...credentials,
    });
    expect(result).toBe('skipped');
    expect(r2.seen.slice(before)).toEqual(['HEAD /sciclub-tiles/ca-20261025.pmtiles']);
  });

  it('puts a small file in one go', async () => {
    const file = path.join(dir, 'us-20261025.pmtiles');
    await writeFile(file, 'small');
    await uploadFile({ endpoint, bucket: 'b', key: 'us-20261025.pmtiles', file, ...credentials });
    expect(r2.objects.get('/b/us-20261025.pmtiles')?.toString()).toBe('small');
  });

  it('says what R2 refused without repeating the request', async () => {
    const file = path.join(dir, 'us-20261025.pmtiles');
    await expect(
      uploadFile({
        endpoint,
        bucket: 'b',
        key: 'us-20261025.pmtiles',
        file,
        ...credentials,
        accessKeyId: 'wrong',
      }),
    ).rejects.toThrow('HEAD us-20261025.pmtiles: 403 AccessDenied');
  });
});
