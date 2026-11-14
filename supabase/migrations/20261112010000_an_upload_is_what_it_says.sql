-- An upload is deleted unless its bytes are an image.
--
-- Nightly check uploads/nonimage_as_jpg (2026-11-11): text uploaded as
-- image/jpeg was kept, because storage checks only the declared type. It was
-- served as image/jpeg with no sniffing, so nothing ran, but the owner wants
-- it refused. SQL cannot read an object's bytes, so after every upload to a
-- club bucket (and every upsert that replaces one) this trigger asks the
-- upload-guard function, which reads the first 16 bytes and deletes the file
-- if they are no image. A real image under the wrong label stays: older apps
-- send a misnamed original as it came, and it is harmless. The app checks the bytes before it uploads too
-- (src/lib/image.ts), and link-preview before it keeps a picture.
--
-- The switch, as for notifications: the vault's `upload_guard_url` says where
-- the function is; while it is absent nothing is sent. `upload_guard_secret`
-- is made here.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'upload_guard_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'upload_guard_secret',
      'Sent by upload_guard_send and checked by upload_guard_object.'
    );
  end if;
end;
$$;

-- For the function: the object's declared type, or null once it is gone.
create or replace function public.upload_guard_object(p_secret text, p_bucket text, p_name text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'upload_guard_secret'
  ) then
    raise exception 'Not the upload guard.' using errcode = '42501';
  end if;
  return (select o.metadata ->> 'mimetype' from storage.objects o
           where o.bucket_id = p_bucket and o.name = p_name);
end;
$$;

revoke all on function public.upload_guard_object(text, text, text) from public, anon, authenticated;
grant execute on function public.upload_guard_object(text, text, text) to service_role;

create or replace function public.upload_guard_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
  secret text;
begin
  select s.decrypted_secret into target
    from vault.decrypted_secrets s where s.name = 'upload_guard_url';
  if target is null or target = '' then
    return null;  -- switched off
  end if;
  select s.decrypted_secret into secret
    from vault.decrypted_secrets s where s.name = 'upload_guard_secret';
  -- Sent after the upload commits; storage's rolled-back permission test sends nothing.
  perform net.http_post(
    url := target,
    body := jsonb_build_object('bucket', new.bucket_id, 'name', new.name),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-guard-secret', secret),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  raise warning 'upload_guard_send: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.upload_guard_send() from public, anon, authenticated;

create trigger storage_objects_upload_guard
  after insert on storage.objects
  for each row
  when (new.bucket_id in ('chat', 'photos', 'link-previews'))
  execute function public.upload_guard_send();

-- An upsert replaces the bytes under the same name with a new version.
create trigger storage_objects_upload_guard_replaced
  after update on storage.objects
  for each row
  when (new.bucket_id in ('chat', 'photos', 'link-previews')
        and new.version is distinct from old.version)
  execute function public.upload_guard_send();
