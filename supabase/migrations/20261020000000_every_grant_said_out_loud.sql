-- ============================================================================
-- Every grant the live database has, written down
-- ============================================================================
-- Supabase, 2026-10-30: a table, view or function made in public no longer
-- gets select, insert, update and delete (or execute) for anon,
-- authenticated and service_role by itself. The live tables keep theirs, but
-- a database built from these migrations (local `db reset`, a fresh stack for
-- a probe) would not: no member could read `members`, and the service key
-- used by the event import, push-notify and the scripts could read nothing.
--
-- This grants exactly what such a build loses, measured on 2026-10-20 by
-- building twice, with config.toml's auto_expose_new_tables on and off, and
-- checked against the live database's own privileges: everything here is
-- already granted there, so on the live database it changes nothing. Not one
-- grant more. Tightening any of it (anon's on members, say, which RLS is what
-- stops) is a separate decision.
--
-- From now on a migration that makes a table, view or function grants what
-- it needs itself (HANDOFF "Traps").
-- ============================================================================

-- anon: tables and views
grant select, insert, update, delete on public.blocked_numbers to anon;
grant select, insert, update, delete on public.data_feeds to anon;
grant select, insert, update, delete on public.event_rsvps to anon;
grant insert, update, delete on public.event_series to anon;
grant select, insert, update, delete on public.event_tags to anon;
grant insert, update, delete on public.events to anon;
grant select, delete on public.invites to anon;
grant select, insert, update, delete on public.members to anon;
grant select, insert, update, delete on public.organizations to anon;
grant select, insert, update, delete on public.tags to anon;

-- authenticated: tables and views
grant select, insert, update, delete on public.blocked_numbers to authenticated;
grant select, insert, update, delete on public.data_feeds to authenticated;
grant select, insert, update, delete on public.event_rsvps to authenticated;
grant insert, update, delete on public.event_series to authenticated;
grant select, insert, update, delete on public.event_tags to authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, delete on public.invites to authenticated;
grant insert, update, delete on public.member_strikes to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant update on public.organization_follows to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.tags to authenticated;

-- service_role: tables and views
grant select, insert, update, delete on public.blocked_emails to service_role;
grant select, insert, update, delete on public.blocked_numbers to service_role;
grant select, insert, update, delete on public.chat_edits to service_role;
grant select, insert, update, delete on public.chat_message_reactions to service_role;
grant select, insert, update, delete on public.chat_messages to service_role;
grant select, insert, update, delete on public.chat_post_likes to service_role;
grant select, insert, update, delete on public.chat_post_reactions to service_role;
grant select, insert, update, delete on public.chat_post_views to service_role;
grant select, insert, update, delete on public.chat_posts to service_role;
grant select, insert, update, delete on public.chat_removed_bodies to service_role;
grant select, insert, update, delete on public.chat_reports to service_role;
grant select, insert, update, delete on public.chat_room_members to service_role;
grant select, insert, update, delete on public.chat_room_mutes to service_role;
grant select, insert, update, delete on public.chat_rooms to service_role;
grant select, insert, update, delete on public.chat_thread_members to service_role;
grant select, insert, update, delete on public.chat_thread_mutes to service_role;
grant select, insert, update, delete on public.chat_threads to service_role;
grant select, insert, update, delete on public.chat_topic_mutes to service_role;
grant select, insert, update, delete on public.chat_topic_reads to service_role;
grant select, insert, update, delete on public.chat_topics to service_role;
grant select, insert, update, delete on public.club_joining to service_role;
grant select, insert, update, delete on public.data_feeds to service_role;
grant select, insert, update, delete on public.event_rsvps to service_role;
grant select, insert, update, delete on public.event_series to service_role;
grant select, insert, update, delete on public.event_tags to service_role;
grant select, insert, update, delete on public.events to service_role;
grant select, insert, update, delete on public.home_screen_handoffs to service_role;
grant select, insert, update, delete on public.home_screen_pairings to service_role;
grant select, insert, update, delete on public.invites to service_role;
grant select, insert, update, delete on public.member_strikes to service_role;
grant select, insert, update, delete on public.members to service_role;
grant select, insert, update, delete on public.notifications to service_role;
grant select, insert, update, delete on public.onboarding_progress to service_role;
grant select, insert, update, delete on public.onboarding_steps to service_role;
grant select, insert, update, delete on public.organization_follows to service_role;
grant select, insert, update, delete on public.organization_representatives to service_role;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.push_daily_runs to service_role;
grant select, insert, update, delete on public.push_muted_kinds to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.qr_code_claims to service_role;
grant select, insert, update, delete on public.qr_codes to service_role;
grant select, insert, update, delete on public.sign_in_secrets to service_role;
grant select, insert, update, delete on public.sign_ins to service_role;
grant select, insert, update, delete on public.tags to service_role;
grant select, insert, update, delete on public.admin_blocked_emails to service_role;
grant select, insert, update, delete on public.admin_blocked_numbers to service_role;
grant select, insert, update, delete on public.admin_claimable_members to service_role;
grant select, insert, update, delete on public.admin_invites to service_role;
grant select, insert, update, delete on public.admin_members to service_role;
grant select, insert, update, delete on public.admin_strikes to service_role;
grant select, insert, update, delete on public.browse_members to service_role;
grant select, insert, update, delete on public.chat_authors to service_role;
grant select, insert, update, delete on public.chat_room_stats to service_role;
grant select, insert, update, delete on public.event_attendees to service_role;
grant select, insert, update, delete on public.event_rsvp_counts to service_role;

-- service_role: functions
grant execute on function
  public.active_strike_count(uuid),
  public.admin_add_representative(uuid,uuid),
  public.admin_add_strike(uuid,text),
  public.admin_block_email(text,text),
  public.admin_block_number(text,text),
  public.admin_change_imported_event(uuid,uuid,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,text,text),
  public.admin_chat_reports(),
  public.admin_club_stats(text),
  public.admin_create_invite(text,uuid,text),
  public.admin_create_qr_code(text,text),
  public.admin_delete_member(uuid),
  public.admin_delete_topic(uuid),
  public.admin_organization_representatives(),
  public.admin_remove_organization(uuid),
  public.admin_remove_representative(uuid,uuid),
  public.admin_renew_sign_in_secret(text,date),
  public.admin_resolve_chat_report(uuid,text),
  public.admin_revert_imported_event(uuid),
  public.admin_revoke_invite(uuid),
  public.admin_set_joining_open(boolean),
  public.admin_set_member_status(uuid,text),
  public.admin_set_member_type(uuid,text),
  public.admin_set_room_home(text,boolean),
  public.admin_set_room_open(text,boolean),
  public.admin_sign_in_methods(text),
  public.admin_turn_off_qr_code(uuid),
  public.admin_unblock_email(text),
  public.admin_unblock_number(text),
  public.admin_withdraw_strike(uuid,text),
  public.before_user_created(jsonb),
  public.can_edit_organization(uuid),
  public.chat_add_first_post_photographs(text,text[]),
  public.chat_add_to_group(uuid,uuid),
  public.chat_bump_thread(),
  public.chat_bump_topic(),
  public.chat_can_post_in(text),
  public.chat_check_message_reply(),
  public.chat_check_post_attachments(),
  public.chat_check_post_reply(),
  public.chat_create_group(text,uuid[]),
  public.chat_create_room(text,text,text,text,text),
  public.chat_create_topic(text,text,text,text[],boolean),
  public.chat_delete_conversation(uuid),
  public.chat_edit_message(uuid,text),
  public.chat_edit_post(uuid,text),
  public.chat_file_is_in_a_deletable_conversation(text),
  public.chat_file_is_on_a_report(text),
  public.chat_file_is_readable(text),
  public.chat_file_is_reported(text),
  public.chat_file_is_writable(text),
  public.chat_file_kind(text),
  public.chat_file_scope(text),
  public.chat_group_cap(),
  public.chat_is_findable(uuid),
  public.chat_join_event_group(uuid),
  public.chat_mark_posts_seen(uuid[]),
  public.chat_mark_thread_read(uuid),
  public.chat_mark_thread_read_through(uuid,uuid),
  public.chat_mark_topic_read(uuid),
  public.chat_mark_topic_read_through(uuid,uuid),
  public.chat_move_topic(uuid,text),
  public.chat_my_threads(),
  public.chat_open_direct(uuid),
  public.chat_post_view_counts(uuid[]),
  public.chat_remove_message(uuid),
  public.chat_rename_group(uuid,text),
  public.chat_report_message(uuid,text),
  public.chat_report_post(uuid,text),
  public.chat_room_is_readable(text),
  public.chat_set_group_picture(uuid,text),
  public.chat_set_reaction(text,uuid,text),
  public.chat_topic_opening_posts(uuid[]),
  public.chat_topic_reply_count(uuid),
  public.chat_topic_room(uuid),
  public.chat_topic_viewed_by_me(uuid),
  public.chat_topics_for(text),
  public.chat_unread_count(),
  public.claim_invite(text),
  public.claim_qr_code(text),
  public.consume_invite_for_new_member(),
  public.create_my_invite(text,text),
  public.delete_event(uuid),
  public.delete_event_and_later(uuid),
  public.delete_member_for_deleted_user(),
  public.delete_my_account(),
  public.event_host_contacts(uuid),
  public.event_photo_is_writable(text),
  public.event_series_step(text,integer,timestamp with time zone,integer),
  public.extend_all_event_series(),
  public.extend_event_series(uuid),
  public.has_active_invite(text),
  public.i_am_invited(),
  public.invite_address_for_token(text),
  public.invites_refuse_blocked(),
  public.invites_require_inviter(),
  public.is_active_member(),
  public.is_admin(),
  public.is_blocked(text),
  public.is_blocked_email(text),
  public.is_member(),
  public.is_thread_member(uuid),
  public.issue_home_screen_handoff(),
  public.joining_is_open(),
  public.link_picture_is_readable(text),
  public.link_preview_clear(),
  public.link_preview_enqueue(),
  public.link_preview_request(text,uuid),
  public.link_preview_secret_is(text),
  public.live_invite_count(uuid),
  public.may_change_event(uuid),
  public.may_post_events_for(uuid),
  public.members_a_a_username_fn(),
  public.my_claimable_profile(),
  public.my_invite_permissions(),
  public.my_invite_status(),
  public.my_invited_by(),
  public.my_notifications(timestamp with time zone,integer),
  public.my_onboarding_progress(),
  public.my_organizations(),
  public.my_unseen_notification_count(),
  public.nearby_events(double precision,double precision,double precision),
  public.normalize_email(text),
  public.notifications_forget(),
  public.notifications_mark_read(uuid),
  public.notifications_mark_seen(),
  public.notifications_read_with_chat(),
  public.notifications_record(text,jsonb),
  public.organization_logo_is_writable(text),
  public.pair_home_screen_app(text),
  public.photo_is_my_claimable(text),
  public.push_daily(),
  public.push_notify_enqueue(),
  public.push_notify_send(text,jsonb),
  public.push_subscribe(text,text,text,text),
  public.qr_code_details(text),
  public.record_sign_in(text,boolean),
  public.save_event(uuid,uuid,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,text,text),
  public.save_event_series(uuid,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,text,text,text,integer,date,integer),
  public.save_onboarding_progress(text,jsonb),
  public.save_organization(uuid,text,text,text,text,text[],boolean),
  public.set_event_photo(uuid,text,text),
  public.set_my_username(text),
  public.set_organization_logo(uuid,text),
  public.sign_in_secret_remind(),
  public.signup_needs_an_invite(jsonb),
  public.speaks_for(uuid),
  public.suggest_usernames(text),
  public.username_available(text)
to service_role;

