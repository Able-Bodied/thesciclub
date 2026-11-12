/**
 * upload-guard: deletes an upload whose bytes are not an image
 * (nightly check uploads/nonimage_as_jpg).
 *
 * Storage checks only the declared type, and SQL cannot read the bytes, so
 * the storage_objects_upload_guard triggers (20261112010000) call this
 * through pg_net after every upload to chat, photos and link-previews; it
 * reads the first 16 bytes.
 * Deployed with `verify_jwt = false`: the caller carries the vault's
 * `upload_guard_secret`, which `upload_guard_object` checks. A real image
 * passes; anything else is gone about a second after it was stored.
 */

import { SNIFF_BYTES, sniffImageType } from '../_shared/image-type.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKETS = new Set(['chat', 'photos', 'link-previews']);

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serviceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { apikey: SERVICE_KEY, ...extra };
  if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  return headers;
}

const objectPath = (bucket: string, name: string) =>
  `${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;

/** The first bytes of the stored file, without reading the rest. */
async function head(bucket: string, name: string): Promise<Uint8Array | null> {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/authenticated/${objectPath(bucket, name)}`,
    { headers: serviceHeaders({ Range: `bytes=0-${SNIFF_BYTES - 1}` }) },
  );
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const bytes = new Uint8Array(SNIFF_BYTES);
  let filled = 0;
  while (filled < SNIFF_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = value.subarray(0, SNIFF_BYTES - filled);
    bytes.set(take, filled);
    filled += take.length;
  }
  await reader.cancel().catch(() => undefined);
  return bytes.subarray(0, filled);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  const secret = request.headers.get('x-guard-secret') ?? '';
  let bucket: unknown;
  let name: unknown;
  try {
    ({ bucket, name } = (await request.json()) as { bucket?: unknown; name?: unknown });
  } catch {
    return reply(400, { error: 'bad body' });
  }
  if (typeof bucket !== 'string' || !BUCKETS.has(bucket) || typeof name !== 'string' || !name) {
    return reply(400, { error: 'bad object' });
  }

  // The declared type, or null when the object is already gone. Refused
  // without the vault's secret.
  const declared = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upload_guard_object`, {
    method: 'POST',
    headers: serviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_secret: secret, p_bucket: bucket, p_name: name }),
  });
  if (!declared.ok) return reply(declared.status === 403 ? 403 : 502, { error: 'not checked' });
  const mimetype = (await declared.json()) as string | null;
  if (mimetype === null) return reply(200, { result: 'gone' });

  const bytes = await head(bucket, name);
  if (bytes === null) return reply(502, { error: 'could not read it' });
  // Any real image stays, even under the wrong label: an older app sends a
  // misnamed original as it came (a JPEG called .png), and it is harmless.
  if (sniffImageType(bytes) !== null) return reply(200, { result: 'kept' });

  const removed = await fetch(`${SUPABASE_URL}/storage/v1/object/${objectPath(bucket, name)}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
  });
  console.warn(
    'upload-guard: removed a file that is not the image it says',
    bucket,
    name,
    mimetype,
  );
  return reply(removed.ok ? 200 : 502, { result: removed.ok ? 'removed' : 'not removed' });
});
