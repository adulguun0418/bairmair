-- Payments through QPay (product-neutral).
--
-- One row per QPay invoice. The web server (secret key) writes every row: it picks the price from
-- its own product list, creates the invoice, and marks a payment paid only after QPay's
-- `/v2/payment/check` confirms it (the callback is just a signal to check). Users can read their
-- own payments and nothing else; they cannot insert or change rows.
--
-- `product` names what was bought (`test` for now; later boosts, agent plans…) and `subject_id`
-- what it applies to (a listing, say). `fulfilled_at` is set once the server has delivered the
-- product, so a delivery that failed after the payment can be retried.
--
-- Payments are accounting records: deleting an account keeps them, without the user.

create type public.payment_status as enum ('pending', 'paid', 'cancelled', 'expired');

create table public.payments (
  id              uuid primary key,
  user_id         uuid references public.profiles (id) on delete set null,
  product         text not null check (product ~ '^[a-z][a-z0-9_]{1,39}$'),
  subject_id      uuid,
  amount          numeric(12, 2) not null check (amount > 0),
  currency        public.currency_code not null default 'MNT' check (currency = 'MNT'),
  description     text not null check (char_length(description) between 1 and 255),
  status          public.payment_status not null default 'pending',
  qpay_invoice_id text not null unique check (char_length(qpay_invoice_id) between 1 and 64),
  -- What the payer needs while the invoice is open: QR text and image, QPay's short link and the
  -- bank-app links, as QPay returned them.
  checkout        jsonb not null,
  qpay_payment_id text,
  paid_amount     numeric(12, 2),
  paid_at         timestamptz,
  fulfilled_at    timestamptz,
  checked_at      timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payments_paid_has_time check (status <> 'paid' or paid_at is not null),
  constraint payments_closed_has_time check (status not in ('cancelled', 'expired') or closed_at is not null)
);

comment on table public.payments is
  'QPay invoices and their outcome. Written only by the web server (secret key).';

create index payments_user_idx on public.payments (user_id, created_at desc);

create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function private.touch_updated_at();

alter table public.payments enable row level security;
revoke all on table public.payments from public, anon, authenticated;

grant select on public.payments to authenticated;

create policy "select own" on public.payments for select to authenticated
  using (user_id = (select auth.uid()));
