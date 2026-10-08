alter table public.credit_wallets

add column if not exists credit_debt integer not null default 0;

alter table public.credit_wallets

drop constraint if exists credit_wallets_credit_debt_check;

alter table public.credit_wallets

add constraint credit_wallets_credit_debt_check check (credit_debt >= 0);

create table if not exists public.credit_purchases (

  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,

  stripe_checkout_session_id text not null unique,

  stripe_payment_intent_id text unique,

  pack_id text not null,

  credits integer not null check (credits > 0),

  amount_pence integer not null check (amount_pence > 0),

  currency text not null default 'gbp',

  status text not null default 'paid'

    check (status in ('paid','completed','partially_refunded','refunded')),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);

create index if not exists credit_purchases_user_created_idx

on public.credit_purchases(user_id, created_at desc);

create index if not exists credit_purchases_payment_intent_idx

on public.credit_purchases(stripe_payment_intent_id);

alter table public.credit_purchases enable row level security;

drop policy if exists "Users can read own credit purchases"

on public.credit_purchases;

create policy "Users can read own credit purchases"

on public.credit_purchases

for select

to authenticated

using (auth.uid() = user_id);

create or replace function public.apply_credit_purchase(
  p_user_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_pack_id text,
  p_credits integer,
  p_amount_pence integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.credit_purchases%rowtype;
  v_debt integer;
  v_debt_payment integer;
begin
  if p_user_id is null
     or nullif(trim(p_checkout_session_id), '') is null
     or nullif(trim(p_pack_id), '') is null
     or p_credits is null or p_credits <= 0
     or p_amount_pence is null or p_amount_pence <= 0
     or nullif(trim(p_currency), '') is null then
    raise exception 'Invalid credit purchase';
  end if;

  insert into public.credit_purchases (
    user_id, stripe_checkout_session_id, stripe_payment_intent_id,
    pack_id, credits, amount_pence, currency, status
  ) values (
    p_user_id, p_checkout_session_id, p_payment_intent_id,
    p_pack_id, p_credits, p_amount_pence, lower(p_currency), 'paid'
  )
  on conflict (stripe_checkout_session_id) do nothing
  returning * into v_purchase;

  if not found then
    select * into v_purchase
    from public.credit_purchases
    where stripe_checkout_session_id = p_checkout_session_id;

    if not found then
      raise exception 'Unable to verify existing credit purchase';
    end if;

    if v_purchase.user_id is distinct from p_user_id
       or v_purchase.stripe_payment_intent_id is distinct from p_payment_intent_id
       or v_purchase.pack_id is distinct from p_pack_id
       or v_purchase.credits is distinct from p_credits
       or v_purchase.amount_pence is distinct from p_amount_pence
       or v_purchase.currency is distinct from lower(p_currency) then
      raise exception 'Conflicting Stripe purchase details';
    end if;

    return true;
  end if;

  insert into public.credit_wallets (
    user_id, available_credits, reserved_credits
  ) values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select coalesce(credit_debt, 0) into v_debt
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  v_debt_payment := least(v_debt, p_credits);

  update public.credit_wallets
  set available_credits = available_credits + (p_credits - v_debt_payment),
      credit_debt = greatest(credit_debt - v_debt_payment, 0),
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_transactions (
    user_id, amount, transaction_type, description
  ) values (
    p_user_id, p_credits, 'purchase', 'Stripe credit purchase: ' || p_pack_id
  );

  return true;
end;
$$;

revoke all on function public.apply_credit_purchase(

  uuid, text, text, text, integer, integer, text

) from public, anon, authenticated;

grant execute on function public.apply_credit_purchase(

  uuid, text, text, text, integer, integer, text

) to service_role;

alter table public.generation_jobs

add column if not exists final_asset_ready boolean not null default false;

alter table public.generation_jobs

add column if not exists settlement_error text;

alter table public.credit_purchases

add column if not exists refunded_amount_pence integer not null default 0;

alter table public.credit_purchases

add column if not exists refunded_credits integer not null default 0;

alter table public.credit_purchases

add column if not exists refunded_at timestamptz;

create or replace function public.mark_generation_final_asset_ready(

  p_job_id uuid,

  p_output_url text

)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_user_id uuid := auth.uid();

begin

  if v_user_id is null then

    raise exception 'Authentication required';

  end if;

  update public.generation_jobs

  set

    final_asset_ready = true,

    output_url = p_output_url,

    current_stage = 'settling',

    progress = greatest(coalesce(progress, 0), 99),

    settlement_error = null

  where id = p_job_id

    and user_id = v_user_id

    and status = 'processing';

  return found;

end;

$$;

create or replace function public.record_generation_settlement_error(

  p_job_id uuid,

  p_reason text

)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_user_id uuid := auth.uid();

begin

  if v_user_id is null then

    raise exception 'Authentication required';

  end if;

  update public.generation_jobs

  set

    current_stage = 'settlement_pending',

    progress = greatest(coalesce(progress, 0), 99),

    settlement_error = left(coalesce(p_reason, 'Settlement pending'), 500)

  where id = p_job_id

    and user_id = v_user_id

    and status = 'processing'

    and final_asset_ready = true;

  return found;

end;

$$;

create or replace function public.start_generation_job(p_job_id uuid)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_user_id uuid := auth.uid();

begin

  if v_user_id is null then

    raise exception 'Authentication required';

  end if;

  update public.generation_jobs

  set

    status = 'processing',

    current_stage = 'scene_visuals',

    progress = greatest(coalesce(progress, 0), 1),

    started_at = coalesce(started_at, now()),

    settlement_error = null

  where id = p_job_id

    and user_id = v_user_id

    and status = 'reserved'

    and credits_reserved > 0;

  if found then

    update public.episodes

    set status = 'generating'

    where id = (

      select episode_id from public.generation_jobs where id = p_job_id

    );

    return true;

  end if;

  return exists(

    select 1

    from public.generation_jobs

    where id = p_job_id

      and user_id = v_user_id

      and status = 'processing'

      and credits_reserved > 0

  );

end;

$$;

create or replace function public.release_generation_credits(

  p_job_id uuid,

  p_reason text

)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_user_id uuid := auth.uid();

  v_reserved integer;

  v_episode_id uuid;

begin

  if v_user_id is null then

    raise exception 'Authentication required';

  end if;

  select credits_reserved, episode_id

  into v_reserved, v_episode_id

  from public.generation_jobs

  where id = p_job_id

    and user_id = v_user_id

    and status in ('reserved', 'processing')

    and coalesce(final_asset_ready, false) = false

  for update;

  if not found then

    return false;

  end if;

  update public.credit_wallets

  set

    available_credits = available_credits + v_reserved,

    reserved_credits = greatest(reserved_credits - v_reserved, 0)

  where user_id = v_user_id;

  update public.generation_jobs

  set

    status = 'failed',

    credits_reserved = 0,

    current_stage = 'failed',

    progress = least(coalesce(progress, 0), 98),

    completed_at = now(),

    settlement_error = left(coalesce(p_reason, 'Production failed'), 500)

  where id = p_job_id

    and user_id = v_user_id;

  update public.episodes

  set status = 'storyboard_ready'

  where id = v_episode_id

    and status = 'generating';

  insert into public.credit_transactions (

    user_id, amount, transaction_type, description

  ) values (

    v_user_id,

    v_reserved,

    'release',

    left(coalesce(p_reason, 'Production credits released'), 500)

  );

  return true;

end;

$$;

create or replace function public.complete_generation_job(

  p_job_id uuid,

  p_output_url text

)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_user_id uuid := auth.uid();

  v_reserved integer;

  v_episode_id uuid;

  v_thumbnail text;

begin

  if v_user_id is null then

    raise exception 'Authentication required';

  end if;

  select credits_reserved, episode_id

  into v_reserved, v_episode_id

  from public.generation_jobs

  where id = p_job_id

    and user_id = v_user_id

    and status = 'processing'

    and coalesce(final_asset_ready, false) = true

  for update;

  if not found then

    return false;

  end if;

  select public_url

  into v_thumbnail

  from public.generation_assets

  where generation_job_id = p_job_id

    and asset_type = 'image'

    and status = 'completed'

  order by scene_number asc nulls last

  limit 1;

  update public.credit_wallets

  set reserved_credits = greatest(reserved_credits - v_reserved, 0)

  where user_id = v_user_id;

  update public.generation_jobs

  set

    status = 'completed',

    credits_reserved = 0,

    output_url = p_output_url,

    current_stage = 'completed',

    progress = 100,

    completed_at = now(),

    settlement_error = null

  where id = p_job_id

    and user_id = v_user_id;

  update public.episodes

  set

    status = 'completed',

    output_url = p_output_url,

    thumbnail_url = coalesce(v_thumbnail, thumbnail_url),

    production_completed_at = now(),

    production_generation_count = coalesce(production_generation_count, 0) + 1

  where id = v_episode_id

    and user_id = v_user_id;

  insert into public.credit_transactions (

    user_id, amount, transaction_type, description

  ) values (

    v_user_id,

    0,

    'generation',

    'Production completed using reserved credits'

  );

  return true;

end;

$$;

create or replace function public.apply_credit_refund(

  p_payment_intent_id text,

  p_refunded_amount_pence integer

)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_purchase public.credit_purchases%rowtype;

  v_target_refunded_credits integer;

  v_credit_delta integer;

  v_available integer;

  v_remove integer;

  v_debt integer;

begin

  if nullif(trim(p_payment_intent_id), '') is null

   or p_refunded_amount_pence is null

   or p_refunded_amount_pence < 0 then

    raise exception 'Invalid refund';

  end if;

  select * into v_purchase

  from public.credit_purchases

  where stripe_payment_intent_id = p_payment_intent_id

  for update;

  if not found then

  raise exception 'Credit purchase not found for refund';

end if;

  if v_purchase.amount_pence <= 0 then

    raise exception 'Invalid purchase amount';

  end if;

  if p_refunded_amount_pence >= v_purchase.amount_pence then

    v_target_refunded_credits := v_purchase.credits;

  else

    v_target_refunded_credits := floor(

      (v_purchase.credits::numeric * p_refunded_amount_pence::numeric) /

      v_purchase.amount_pence::numeric

    );

  end if;

  v_credit_delta := greatest(

    v_target_refunded_credits - coalesce(v_purchase.refunded_credits, 0),

    0

  );

  update public.credit_purchases

  set

    refunded_amount_pence = greatest(

      coalesce(refunded_amount_pence, 0),

      least(p_refunded_amount_pence, amount_pence)

    ),

    refunded_credits = greatest(

      coalesce(refunded_credits, 0),

      v_target_refunded_credits

    ),

    refunded_at = case

      when p_refunded_amount_pence > 0 then coalesce(refunded_at, now())

      else refunded_at

    end,

    status = case

      when p_refunded_amount_pence >= amount_pence then 'refunded'

      when p_refunded_amount_pence > 0 then 'partially_refunded'

      else status

    end

  where id = v_purchase.id;

  if v_credit_delta <= 0 then

    return true;

  end if;

  select available_credits

  into v_available

  from public.credit_wallets

  where user_id = v_purchase.user_id

  for update;

  if not found then

    raise exception 'Credit wallet not found';

  end if;

  v_remove := least(v_available, v_credit_delta);

  v_debt := v_credit_delta - v_remove;

  update public.credit_wallets

  set

    available_credits = available_credits - v_remove,

    credit_debt = credit_debt + v_debt

  where user_id = v_purchase.user_id;

  return true;

end;

$$;

create or replace function public.reconcile_credit_debt(p_user_id uuid)

returns boolean

language plpgsql

security definer

set search_path = public

as $$

declare

  v_available integer;

  v_debt integer;

  v_payment integer;

begin

  select available_credits, credit_debt

  into v_available, v_debt

  from public.credit_wallets

  where user_id = p_user_id

  for update;

  if not found then

    return false;

  end if;

  v_payment := least(v_available, v_debt);

  if v_payment <= 0 then

    return true;

  end if;

  update public.credit_wallets

  set

    available_credits = available_credits - v_payment,

    credit_debt = credit_debt - v_payment

  where user_id = p_user_id;

  return true;

end;

$$;

revoke all on function public.mark_generation_final_asset_ready(uuid, text) from public, anon;

grant execute on function public.mark_generation_final_asset_ready(uuid, text) to authenticated;

revoke all on function public.record_generation_settlement_error(uuid, text) from public, anon;

grant execute on function public.record_generation_settlement_error(uuid, text) to authenticated;

revoke all on function public.start_generation_job(uuid) from public, anon;

grant execute on function public.start_generation_job(uuid) to authenticated;

revoke all on function public.release_generation_credits(uuid, text) from public, anon;

grant execute on function public.release_generation_credits(uuid, text) to authenticated;

revoke all on function public.complete_generation_job(uuid, text) from public, anon;

grant execute on function public.complete_generation_job(uuid, text) to authenticated;

revoke all on function public.apply_credit_refund(text, integer) from public, anon, authenticated;

grant execute on function public.apply_credit_refund(text, integer) to service_role;

revoke all on function public.reconcile_credit_debt(uuid) from public, anon, authenticated;

grant execute on function public.reconcile_credit_debt(uuid) to service_role;

create or replace function public.reserve_generation_credits(

  p_job_id uuid,

  p_credits integer

)

returns boolean

language plpgsql

security definer

set search_path = ''

as $function$

declare

  v_user_id uuid := auth.uid();

  v_available integer;

  v_required integer;

  v_debt integer;

begin

  if v_user_id is null then

    raise exception 'Not authenticated';

  end if;

  if p_credits is null or p_credits <= 0 then

    raise exception 'Invalid credit amount';

  end if;

  select credits_required

  into v_required

  from public.generation_jobs

  where id = p_job_id

    and user_id = v_user_id

    and status = 'quoted'

  for update;

  if v_required is null then

    raise exception 'Generation job is not available for reservation';

  end if;

  if v_required <> p_credits then

    raise exception 'Credit amount does not match the server quote';

  end if;

  select available_credits, credit_debt

  into v_available, v_debt

  from public.credit_wallets

  where user_id = v_user_id

  for update;

  if coalesce(v_debt, 0) > 0 then

    raise exception 'Account restricted due to outstanding credit debt';

  end if;

  if coalesce(v_available, 0) < p_credits then

    return false;

  end if;

  update public.credit_wallets

  set

    available_credits = available_credits - p_credits,

    reserved_credits = reserved_credits + p_credits,

    updated_at = now()

  where user_id = v_user_id;

  update public.generation_jobs

  set

    status = 'reserved',

    credits_reserved = p_credits,

    current_stage = 'reserved',

    progress = 0

  where id = p_job_id

    and user_id = v_user_id;

  insert into public.credit_transactions (

    user_id,

    amount,

    transaction_type,

    description,

    generation_job_id

  )

  values (

    v_user_id,

    -p_credits,

    'reserve',

    'Credits reserved for AI generation',

    p_job_id

  );

  return true;

end;

$function$;

revoke execute on function public.reserve_generation_credits(uuid, integer)

from public, anon;

grant execute on function public.reserve_generation_credits(uuid, integer)

to authenticated, service_role;
