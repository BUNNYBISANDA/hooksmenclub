-- Fresh Supabase project. All appointment instants are timestamptz; local rules use Asia/Bangkok.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.shop_settings (
  id boolean primary key default true check (id),
  name text not null default 'Hook Menclub',
  address text not null default '888/88 โครงการเจ้าสัว 69 ถ.บางบอน 3, แขวงหลักสอง เขตบางแค กรุงเทพฯ 10160',
  phone text not null default '099 059 2205',
  latitude numeric not null default 13.6884457,
  longitude numeric not null default 100.3824744,
  timezone text not null default 'Asia/Bangkok' check (timezone = 'Asia/Bangkok'),
  rating numeric not null default 4.7 check (rating between 0 and 5),
  review_count integer not null default 27 check (review_count >= 0),
  cancellation_hours integer not null default 4 check (cancellation_hours between 0 and 168),
  slot_step_minutes integer not null default 15 check (slot_step_minutes in (5,10,15,20,30,60)),
  minimum_notice_minutes integer not null default 60 check (minimum_notice_minutes between 0 and 10080),
  booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 120),
  online_booking_enabled boolean not null default false,
  line_url text,
  google_review_url text,
  features jsonb not null default '{"walkInQueue":false,"deposits":false,"loyalty":false,"vouchers":false,"products":false,"waitlist":false}'
);
create table public.shop_hours (
  weekday integer primary key check (weekday between 0 and 6),
  opens time not null default '10:30', closes time not null default '19:30',
  closed boolean not null default false, check (opens < closes)
);
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null, description jsonb not null default '{"th":"","en":""}',
  price_baht numeric(10,2) check (price_baht >= 0),
  duration_minutes integer check (duration_minutes between 5 and 480),
  active boolean not null default true, is_placeholder boolean not null default true,
  sort_order integer not null default 0,
  check (is_placeholder or (price_baht is not null and duration_minutes is not null)),
  check (name ? 'th' and name ? 'en')
);
create table public.barbers (
  id uuid primary key default gen_random_uuid(), name jsonb not null,
  specialties jsonb not null default '{"th":"","en":""}', photo_url text,
  active boolean not null default true, is_placeholder boolean not null default true,
  check (name ? 'th' and name ? 'en')
);
create table public.barber_services (
  barber_id uuid not null references public.barbers(id),
  service_id uuid not null references public.services(id), primary key (barber_id, service_id)
);
-- Split shifts may have multiple rows. Breaks use kind='break'.
create table public.barber_schedules (
  id uuid primary key default gen_random_uuid(), barber_id uuid not null references public.barbers(id),
  weekday integer not null check (weekday between 0 and 6),
  starts time not null, ends time not null, kind text not null check (kind in ('work','break')),
  check (starts < ends)
);
create index schedules_lookup on public.barber_schedules(barber_id, weekday);
create table public.time_off (
  id uuid primary key default gen_random_uuid(), barber_id uuid references public.barbers(id),
  starts_at timestamptz not null, ends_at timestamptz not null, reason text,
  check (starts_at < ends_at)
);
create index time_off_window on public.time_off using gist (tstzrange(starts_at, ends_at, '[)'));
create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','barber')), barber_id uuid references public.barbers(id),
  active boolean not null default true, check (role = 'owner' or barber_id is not null)
);
-- No unique phone/upsert: an unauthenticated caller must never overwrite an existing person's profile.
create table public.customers (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 100),
  phone text not null check (phone ~ '^\+66[0-9]{8,9}$'),
  locale text not null default 'th' check (locale in ('th','en')),
  marketing_opt_in boolean not null default false, consent_at timestamptz,
  preferred_style text, created_at timestamptz not null default now()
);
create index customers_phone on public.customers(phone);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('HM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  customer_id uuid not null references public.customers(id), barber_id uuid not null references public.barbers(id),
  starts_at timestamptz not null, ends_at timestamptz not null, occupied_until timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','arrived','in_service','completed','no_show','cancelled')),
  source text not null default 'web' check (source in ('web','phone','walk_in')),
  note text check (length(note) <= 1000), cancel_reason text check (length(cancel_reason) <= 500),
  cancellation_hours integer not null check (cancellation_hours >= 0),
  buffer_minutes integer not null check (buffer_minutes >= 0),
  idempotency_key uuid not null unique, request_fingerprint text not null,
  revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (starts_at < ends_at and occupied_until >= ends_at),
  exclude using gist (barber_id with =, tstzrange(starts_at, occupied_until, '[)') with &&) where (status <> 'cancelled')
);
create index bookings_customer on public.bookings(customer_id);
create index bookings_starts on public.bookings(starts_at);
create table public.booking_services (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id), name jsonb not null,
  price_baht numeric(10,2) not null check (price_baht >= 0), duration_minutes integer not null check (duration_minutes > 0),
  primary key (booking_id, service_id)
);
create table public.booking_access_tokens (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, revoked_at timestamptz
);
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(), image_url text,
  caption jsonb not null default '{"th":"","en":""}',
  category text not null default 'haircut' check (category in ('haircut','before_after','kids')),
  pair_id uuid, is_placeholder boolean not null default true, published boolean not null default false
);
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id),
  booking_revision integer not null, kind text not null,
  recipient text not null check (recipient in ('customer','owner')),
  due_at timestamptz not null, status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0, last_error_code text,
  unique (booking_id, booking_revision, kind, recipient)
);
create index notification_due on public.notification_jobs(due_at) where status = 'pending';
create table public.notifications_log (
  id uuid primary key default gen_random_uuid(), job_id uuid references public.notification_jobs(id),
  channel text not null check (channel in ('line','sms')), provider_id text, status text not null,
  error_code text, created_at timestamptz not null default now()
);
create table public.reviews_requests (
  booking_id uuid primary key references public.bookings(id), due_at timestamptz not null, sent_at timestamptz
);
create table public.customer_channels (
  customer_id uuid primary key references public.customers(id), line_user_id text unique,
  verified_at timestamptz, opted_out_at timestamptz
);
create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id),
  status text not null default 'pending' check (status in ('pending','verified','completed','rejected')),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.audit_events (
  id bigint generated always as identity primary key, booking_id uuid references public.bookings(id),
  actor_id uuid, actor_kind text not null, action text not null, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table private.rate_limits (
  key text primary key, window_start timestamptz not null, hits integer not null
);

create function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_profiles where user_id = auth.uid() and role = 'owner' and active);
$$;
create function private.can_access_barber(p_barber uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_profiles where user_id = auth.uid() and active and (role = 'owner' or barber_id = p_barber));
$$;
revoke all on function private.is_owner(), private.can_access_barber(uuid) from public;
grant execute on function private.is_owner(), private.can_access_barber(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['shop_settings','shop_hours','services','barbers','barber_services','barber_schedules','time_off','staff_profiles','customers','bookings','booking_services','booking_access_tokens','gallery_items','notification_jobs','notifications_log','reviews_requests','customer_channels','privacy_requests','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('create policy owner_read on public.%I for select to authenticated using (private.is_owner())', t);
    -- Token hashes, channel IDs and job internals are server-only, including for owners.
    if t not in ('booking_access_tokens','customer_channels','notification_jobs','notifications_log') then
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;
end $$;
grant usage, select on sequence public.audit_events_id_seq to service_role;
grant all on private.rate_limits to service_role;
alter table private.rate_limits enable row level security;

grant select on public.services, public.barbers, public.barber_services, public.gallery_items, public.shop_hours, public.shop_settings to anon;
create policy public_catalog on public.services for select to anon, authenticated using (active);
create policy public_catalog on public.barbers for select to anon, authenticated using (active);
create policy public_catalog on public.barber_services for select to anon, authenticated using (
  exists(select 1 from public.barbers b where b.id = barber_id and b.active) and exists(select 1 from public.services s where s.id = service_id and s.active)
);
create policy public_gallery on public.gallery_items for select to anon, authenticated using (published);
create policy public_settings on public.shop_settings for select to anon, authenticated using (true);
create policy public_hours on public.shop_hours for select to anon, authenticated using (true);
create policy own_profile on public.staff_profiles for select to authenticated using (user_id = auth.uid());
create policy assigned_bookings on public.bookings for select to authenticated using (private.can_access_barber(barber_id));
create policy assigned_customers on public.customers for select to authenticated using (
  exists(select 1 from public.bookings b where b.customer_id = customers.id and private.can_access_barber(b.barber_id))
);
create policy assigned_services on public.booking_services for select to authenticated using (
  exists(select 1 from public.bookings b where b.id = booking_id and private.can_access_barber(b.barber_id))
);
create policy own_schedules on public.barber_schedules for select to authenticated using (private.can_access_barber(barber_id));
create policy own_time_off on public.time_off for select to authenticated using (barber_id is null or private.can_access_barber(barber_id));

-- One small shop: serialize schedule mutations with a transaction-level lock.
-- All future admin RPCs must acquire the same lock BEFORE reading availability.
create function private.lock_schedule() returns trigger language plpgsql set search_path = '' as $$
begin perform pg_catalog.pg_advisory_xact_lock(880088); return null; end;
$$;
revoke all on function private.lock_schedule() from public;
do $$ declare t text; begin
  foreach t in array array['shop_settings','shop_hours','services','barbers','barber_services','barber_schedules','time_off','bookings'] loop
    execute format('create trigger lock_schedule before insert or update or delete on public.%I for each statement execute function private.lock_schedule()', t);
  end loop;
end $$;
