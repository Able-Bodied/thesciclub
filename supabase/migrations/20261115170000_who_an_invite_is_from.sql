-- ============================================================================
-- Who an invite is from, for the welcome screen
-- ============================================================================
-- The owner, 2026-11-15: an invite's link lands on the welcome screen, and in
-- place of "No invite yet? Request an invite" it says "You have an invite"
-- from whoever sent it.
--
-- For the holder of a live invite's link only, as invite_details_for_token
-- (20261114030000): the same token, the same conditions, and nothing for any
-- other. The organization's name for an organization's invite, otherwise the
-- inviting member's first name ("Wojtek" of "Wojtek ..."): what the invite
-- email already told them.
-- Unlike invite_details_for_token it notes nothing.
-- ============================================================================

create or replace function public.invite_from_for_token(token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.name, nullif(split_part(btrim(m.display_name), ' ', 1), ''))
    from public.invites i
    left join public.organizations o on o.id = i.invited_by_organization_id
    left join public.members m on m.id = i.invited_by_member_id
   where i.token_hash = encode(extensions.digest(btrim(coalesce(token, '')), 'sha256'), 'hex')
     and i.status = 'pending'
     and i.claimed_by is null
     and i.email is not null
     and not public.is_blocked_email(i.email::text)
   limit 1;
$$;

revoke all on function public.invite_from_for_token(text) from public;
grant execute on function public.invite_from_for_token(text) to anon, authenticated;

comment on function public.invite_from_for_token(text) is
  'Who a live invite is from, for its link''s welcome screen. See 20261115170000.';
