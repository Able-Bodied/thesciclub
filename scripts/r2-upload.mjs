/**
 * Uploads to R2 through its S3 API, signed here (AWS Signature V4) so the
 * script needs no SDK. Big files go in parts: R2's dashboard and `wrangler r2
 * object put` stop at about 300 MB, and California is about 630 MB.
 * Credentials are only ever sent, never printed.
 */

import { createHash, createHmac } from 'node:crypto';
import { open, stat } from 'node:fs/promises';

/** R2 wants parts of one size (but the last), 5 MiB to 5 GiB. */
export const PART_SIZE = 8 * 1024 * 1024;
// A stalled request fails and retries instead of hanging: a minute, plus
// time for the body at 100 kB/s.
const timeoutFor = (bytes) => 60_000 + Math.ceil(bytes / 100);
const EMPTY_HASH = createHash('sha256').update('').digest('hex');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
// RFC 3986, as SigV4 wants: encodeURIComponent leaves !'()* alone.
const encode = (text) =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** The headers that sign one request, Authorization included. */
export function signedHeaders({
  method,
  url,
  headers = {},
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region = 'auto',
  service = 's3',
  now = new Date(),
}) {
  const target = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = {};
  for (const [name, value] of Object.entries(headers)) all[name.toLowerCase()] = String(value);
  all.host = target.host;
  all['x-amz-content-sha256'] = payloadHash;
  all['x-amz-date'] = amzDate;
  const names = Object.keys(all).sort();
  const path = target.pathname
    .split('/')
    .map((part) => encode(decodeURIComponent(part)))
    .join('/');
  const query = [...target.searchParams]
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .sort()
    .join('&');
  const canonical = [
    method,
    path,
    query,
    names.map((name) => `${name}:${all[name].trim()}\n`).join(''),
    names.join(';'),
    payloadHash,
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service),
    'aws4_request',
  );
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  const { host: _host, ...sent } = all;
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

/** R2's error code and message only: its bodies can echo the request. */
async function failure(what, response) {
  const text = await response.text().catch(() => '');
  const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1] ?? '';
  const message = /<Message>([^<]*)<\/Message>/.exec(text)?.[1] ?? '';
  return new Error(`${what}: ${response.status} ${code} ${message}`.trim());
}

/**
 * Puts `file` at `key`, skipping it when an object of the same size is there.
 * Returns 'skipped' or 'uploaded'.
 */
export async function uploadFile({
  endpoint,
  bucket,
  key,
  file,
  accessKeyId,
  secretAccessKey,
  partSize = PART_SIZE,
  log = () => undefined,
  fetch = globalThis.fetch,
}) {
  const objectUrl = `${endpoint.replace(/\/$/, '')}/${bucket}/${encode(key)}`;
  const request = async (method, url, { body, headers = {} } = {}) => {
    const payloadHash = body === undefined ? EMPTY_HASH : sha256(body);
    const signed = signedHeaders({
      method,
      url,
      headers,
      payloadHash,
      accessKeyId,
      secretAccessKey,
    });
    const signal = AbortSignal.timeout(timeoutFor(body?.length ?? 0));
    return fetch(url, { method, headers: signed, body, signal });
  };

  const { size } = await stat(file);
  const existing = await request('HEAD', objectUrl);
  if (existing.ok && Number(existing.headers.get('content-length')) === size) return 'skipped';
  if (!existing.ok && existing.status !== 404) throw await failure(`HEAD ${key}`, existing);

  const type = { 'content-type': 'application/octet-stream' };
  const handle = await open(file);
  try {
    const read = async (offset, length) => {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      return buffer;
    };

    if (size <= partSize) {
      const put = await request('PUT', objectUrl, { body: await read(0, size), headers: type });
      if (!put.ok) throw await failure(`PUT ${key}`, put);
      return 'uploaded';
    }

    const started = await request('POST', `${objectUrl}?uploads`, { headers: type });
    if (!started.ok) throw await failure(`start ${key}`, started);
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await started.text())?.[1];
    if (!uploadId) throw new Error(`start ${key}: no UploadId`);
    const inUpload = (query) => `${objectUrl}?${query}uploadId=${encode(uploadId)}`;

    try {
      const parts = [];
      const count = Math.ceil(size / partSize);
      for (let number = 1; number <= count; number++) {
        const offset = (number - 1) * partSize;
        const body = await read(offset, Math.min(partSize, size - offset));
        let response;
        let why;
        for (let attempt = 1; attempt <= 3; attempt++) {
          response = await request('PUT', inUpload(`partNumber=${number}&`), { body }).catch(
            (error) => ({ ok: false, status: 0, text: () => Promise.resolve(String(error)) }),
          );
          if (response.ok) break;
          why = (await failure(`${key} part ${number}`, response)).message;
          log(`  ${why} (try ${attempt} of 3)`);
        }
        if (!response.ok) throw new Error(why);
        parts.push({ number, etag: response.headers.get('etag') });
        log(`  ${key}: part ${number}/${count}, ${((offset + body.length) / 1e6).toFixed(0)} MB`);
      }
      const xml = `<CompleteMultipartUpload>${parts
        .map(
          ({ number, etag }) =>
            `<Part><PartNumber>${number}</PartNumber><ETag>${etag}</ETag></Part>`,
        )
        .join('')}</CompleteMultipartUpload>`;
      const done = await request('POST', inUpload(''), {
        body: Buffer.from(xml),
        headers: { 'content-type': 'application/xml' },
      });
      // S3 can say 200 and still put an error in the body.
      const text = await done.text();
      if (!done.ok || text.includes('<Error>')) {
        throw await failure(`finish ${key}`, new Response(text, { status: done.status }));
      }
      return 'uploaded';
    } catch (error) {
      await request('DELETE', inUpload('')).catch(() => undefined);
      throw error;
    }
  } finally {
    await handle.close();
  }
}
