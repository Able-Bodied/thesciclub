-- ============================================================================
-- The invite link can say which address it was sent to
-- ============================================================================
-- The owner, 2026-10-11, during the release's smoke test. Somebody who opens
-- an emailed invite lands on the join form and has to type the address the
-- email came to. A typo there sends the confirmation email nowhere, and they
-- are stuck. So the page asks what address the held token was sent to and fills
-- the Email field in, which they may change.
--
-- Why a lookup and not `?email=` in the link: an address in the URL would sit
-- in browser history, request logs, mail scanners and link previews, beside a
-- token that is already secret. Here the link is unchanged, so invites already
-- sent work too, and the address is read only by whoever holds the token.
--
-- What it answers, and to whom:
--   * the address of a PENDING invite nobody has claimed yet, for the token
--     whose sha256 is stored (the same hashing as claim_invite);
--   * null for everything else, and the same null for each reason: no token, an
--     unknown token, one already claimed, used, revoked, a phone-only invite,
--     or an address the club has blocked. Nobody can tell them apart.
--   * the stored hash is not a token: asking with it answers null.
--
-- It is callable by anon on purpose, since the person on /join has no session
-- yet. What guards it is the token: 32 random bytes, so there is nothing to
-- guess, and it reveals no more than the link's holder could already do (claim
-- the invite). It is not a way to ask whether an address is invited: that
-- needs the token, not the address (compare has_active_invite, which anon
-- cannot call).
-- ============================================================================

create or replace function public.invite_address_for_token(token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(i.email::text)
    from public.invites i
   where i.token_hash = encode(extensions.digest(btrim(token), 'sha256'), 'hex')
     and i.status = 'pending'
     and i.claimed_by is null
     and i.email is not null
     and not public.is_blocked_email(i.email::text)
   limit 1;
$$;

comment on function public.invite_address_for_token(text) is
  'The address a held invite link was sent to, for the join form to fill in. Null for any other token. See 20261012030000.';

revoke all on function public.invite_address_for_token(text) from public;
grant execute on function public.invite_address_for_token(text) to anon, authenticated;
