-- bairmair scan Pro through Apple In-App Purchase (docs/scan/PLAN.md, step 5).
--
-- One scan_subscriptions row per Apple original transaction (an auto-renewing subscription and
-- all its renewals). The web server verifies Apple's signed data (from the app after a purchase
-- or restore, and from App Store Server Notifications) and applies it with
-- apply_apple_subscription():
-- - the row belongs to the account whose id the app passed to StoreKit as appAccountToken; it is
--   never moved to another account (another bairmair account on the same Apple ID is refused);
-- - transaction data applies only when it is at least as new (Apple's signedDate) as what the
--   row holds, renewal data (auto-renew on/off) likewise, so notifications arriving out of order
--   never move an expiry back;
-- - expiry is a time, as for QPay rows; refunds and revocations set the status.

alter table public.scan_subscriptions
  add column apple_transaction_id    text check (char_length(apple_transaction_id) between 1 and 64),
  add column apple_auto_renew        boolean,
  add column apple_signed_at         timestamptz,
  add column apple_renewal_signed_at timestamptz;

comment on column public.scan_subscriptions.apple_auto_renew is
  'Apple only: whether the subscription renews at expires_at (from renewal info); null = unknown.';

-- Applies verified Apple data (server only). Transaction fields (p_transaction_id … p_signed_at)
-- are all null when only renewal info is given, and the renewal fields when only a transaction
-- is. p_user_id is the appAccountToken (or the signed-in caller); null = take the row's owner.
-- Returns 'applied', 'stale' (nothing newer), 'other_account' (the row is someone else's) or
-- 'unknown_user' (no row yet and no live account to give it to).
create function public.apply_apple_subscription(
  p_user_id                 uuid,
  p_original_transaction_id text,
  p_environment             text,
  p_transaction_id          text,
  p_product_id              text,
  p_starts_at               timestamptz,
  p_expires_at              timestamptz,
  p_status                  public.scan_subscription_status,
  p_signed_at               timestamptz,
  p_auto_renew              boolean,
  p_renewal_signed_at       timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.scan_subscriptions;
  v_transaction boolean := p_signed_at is not null;
  v_renewal boolean := p_renewal_signed_at is not null;
  v_changed boolean := false;
begin
  if p_original_transaction_id is null or (not v_transaction and not v_renewal) then
    raise exception 'apply_apple_subscription: nothing to apply';
  end if;
  if v_transaction and (p_transaction_id is null or p_product_id is null
      or p_starts_at is null or p_expires_at is null or p_status is null) then
    raise exception 'apply_apple_subscription: incomplete transaction';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('apple:' || p_original_transaction_id, 0));

  select * into v_row from public.scan_subscriptions s
  where s.apple_original_transaction_id = p_original_transaction_id;

  if not found then
    if not v_transaction or p_user_id is null
        or not exists (select 1 from public.profiles p where p.id = p_user_id) then
      return 'unknown_user';
    end if;
    insert into public.scan_subscriptions (
      user_id, source, product_id, starts_at, expires_at, status,
      apple_original_transaction_id, apple_environment, apple_transaction_id, apple_signed_at,
      apple_auto_renew, apple_renewal_signed_at
    ) values (
      p_user_id, 'apple', p_product_id, p_starts_at, p_expires_at, p_status,
      p_original_transaction_id, p_environment, p_transaction_id, p_signed_at,
      p_auto_renew, p_renewal_signed_at
    );
    return 'applied';
  end if;

  if p_user_id is not null and v_row.user_id <> p_user_id then
    return 'other_account';
  end if;

  if v_transaction and (v_row.apple_signed_at is null or p_signed_at >= v_row.apple_signed_at) then
    update public.scan_subscriptions set
      product_id           = p_product_id,
      starts_at            = p_starts_at,
      expires_at           = p_expires_at,
      status               = p_status,
      apple_environment    = p_environment,
      apple_transaction_id = p_transaction_id,
      apple_signed_at      = p_signed_at
    where id = v_row.id;
    v_changed := true;
  end if;

  if v_renewal and (v_row.apple_renewal_signed_at is null
      or p_renewal_signed_at >= v_row.apple_renewal_signed_at) then
    update public.scan_subscriptions set
      apple_auto_renew        = p_auto_renew,
      apple_renewal_signed_at = p_renewal_signed_at
    where id = v_row.id;
    v_changed := true;
  end if;

  return case when v_changed then 'applied' else 'stale' end;
end;
$$;

comment on function public.apply_apple_subscription is
  'Web server only (secret key): applies verified App Store transaction / renewal data to scan_subscriptions.';

revoke all on function public.apply_apple_subscription(
  uuid, text, text, text, text, timestamptz, timestamptz, public.scan_subscription_status,
  timestamptz, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_apple_subscription(
  uuid, text, text, text, text, timestamptz, timestamptz, public.scan_subscription_status,
  timestamptz, boolean, timestamptz
) to service_role;
