
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed')),
  payment_intent_id text,
  checkout_session_id text,
  attempts integer not null default 0,
  claim_token uuid,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_events
add column if not exists claim_token uuid;

alter table public.stripe_webhook_events
add column if not exists claimed_at timestamptz;

create index if not exists stripe_webhook_events_status_idx
on public.stripe_webhook_events (status, created_at);

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events
from public, anon, authenticated;

grant select, insert, update, delete
on public.stripe_webhook_events
to service_role;

create or replace function public.update_stripe_webhook_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stripe_webhook_events_updated_at
on public.stripe_webhook_events;

create trigger stripe_webhook_events_updated_at
before update on public.stripe_webhook_events
for each row
execute function public.update_stripe_webhook_timestamp();

revoke all on function public.update_stripe_webhook_timestamp()
from public, anon, authenticated;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payment_intent_id text default null,
  p_checkout_session_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_claimed text;
begin
  if nullif(trim(p_event_id), '') is null
     or nullif(trim(p_event_type), '') is null then
    raise exception 'Invalid Stripe event';
  end if;

  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    status,
    payment_intent_id,
    checkout_session_id,
    attempts,
    claim_token,
    claimed_at
  )
  values (
    p_event_id,
    p_event_type,
    'processing',
    p_payment_intent_id,
    p_checkout_session_id,
    1,
    v_token,
    now()
  )
  on conflict (event_id) do nothing
  returning event_id into v_claimed;

  if v_claimed is not null then
    return v_token;
  end if;

  update public.stripe_webhook_events
  set
    status = 'processing',
    attempts = attempts + 1,
    claim_token = v_token,
    claimed_at = now(),
    last_error = null
  where event_id = p_event_id
    and event_type = p_event_type
    and (
      status in ('failed', 'pending')
      or (
        status = 'processing'
        and claimed_at < now() - interval '10 minutes'
      )
    )
  returning event_id into v_claimed;

  if v_claimed is not null then
    return v_token;
  end if;

  return null;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(
  text, text, text, text
) from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(
  text, text, text, text
) to service_role;

create or replace function public.finish_stripe_webhook_event(
  p_event_id text,
  p_claim_token uuid,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated text;
begin
  if nullif(trim(p_event_id), '') is null
     or p_claim_token is null
     or p_success is null then
    raise exception 'Invalid webhook completion';
  end if;

  update public.stripe_webhook_events
  set
    status = case
      when p_success then 'processed'
      else 'failed'
    end,
    processed_at = case
      when p_success then now()
      else null
    end,
    last_error = case
      when p_success then null
      else left(coalesce(p_error, 'Unknown processing error'), 1000)
    end,
    claim_token = null,
    claimed_at = null
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning event_id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.finish_stripe_webhook_event(
  text, uuid, boolean, text
) from public, anon, authenticated;

grant execute on function public.finish_stripe_webhook_event(
  text, uuid, boolean, text
) to service_role;
