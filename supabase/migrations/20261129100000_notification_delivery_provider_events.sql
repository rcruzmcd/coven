-- What happened to a message after the provider accepted it (#1921).
--
-- `status = 'sent'` means Resend took the message, not that it arrived. Until
-- now a hard bounce and a spam complaint were both invisible here: the ledger
-- said "sent" and nothing ever said otherwise. Resend's webhook reports both,
-- keyed by the provider_message_id this table already stores.
--
-- Columns rather than new statuses: the send itself did succeed, and every
-- reader of `status` (the delivery log, its filters, the stuck-row check)
-- stays correct without learning two more values.

alter table public.notification_deliveries
  add column provider_event text
    check (provider_event in ('bounced', 'complained')),
  add column provider_event_at timestamptz,
  add column provider_event_detail text
    check (char_length(provider_event_detail) <= 500);

alter table public.notification_deliveries
  add constraint notification_deliveries_provider_event_needs_sent
    check (provider_event is null or status = 'sent');

comment on column public.notification_deliveries.provider_event is
  'Reported by the provider after sending (#1921): bounced (permanent) or complained (marked as spam). Null when nothing was reported.';
comment on column public.notification_deliveries.provider_event_detail is
  'The provider''s bounce reason, when it gave one. Never message content.';

-- The webhook's lookup. Partial: only sent rows carry an id.
create index notification_deliveries_provider_message_id_idx
  on public.notification_deliveries (provider_message_id)
  where provider_message_id is not null;
