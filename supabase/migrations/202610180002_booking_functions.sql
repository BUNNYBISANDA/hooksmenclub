create function private.fail(p_code text) returns void language plpgsql set search_path = '' as $$
begin raise exception using errcode = 'P0001', message = p_code; end;
$$;

create function private.validate_services(p_ids uuid[]) returns integer language plpgsql stable set search_path = '' as $$
declare total integer; matched integer;
begin
  if p_ids is null or cardinality(p_ids) not between 1 and 8 or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    perform private.fail('INVALID_INPUT');
  end if;
  select sum(duration_minutes), count(*) into total, matched from public.services
    where id = any(p_ids) and active and not is_placeholder and duration_minutes is not null and price_baht is not null;
  if matched <> cardinality(p_ids) then perform private.fail('INVALID_INPUT'); end if;
  return total;
end;
$$;

create function private.slot_candidates(p_date date, p_ids uuid[], p_barber uuid, p_duration integer, p_buffer integer, p_exclude uuid default null)
returns table(starts_at timestamptz, ends_at timestamptz, barber_id uuid)
language sql stable set search_path = '' as $$
  with settings as (
    select s.*, h.opens, h.closes from public.shop_settings s
    join public.shop_hours h on h.weekday = extract(dow from p_date)::integer and not h.closed
    where s.online_booking_enabled
      and p_date between (now() at time zone 'Asia/Bangkok')::date and (now() at time zone 'Asia/Bangkok')::date + s.booking_horizon_days
  ), candidates as (
    select b.id, g.slot, g.slot + make_interval(mins => p_duration) as finish,
      g.slot + make_interval(mins => p_duration + p_buffer) as occupied, s.closes, s.minimum_notice_minutes
    from settings s
    cross join lateral generate_series((p_date + s.opens) at time zone 'Asia/Bangkok',
      (p_date + s.closes) at time zone 'Asia/Bangkok', make_interval(mins => s.slot_step_minutes)) g(slot)
    cross join public.barbers b
    where b.active and not b.is_placeholder and (p_barber is null or b.id = p_barber)
      and not exists(select 1 from unnest(p_ids) x where not exists(
        select 1 from public.barber_services bs where bs.barber_id = b.id and bs.service_id = x))
  )
  select c.slot, c.finish, c.id from candidates c
  where c.slot >= now() + make_interval(mins => c.minimum_notice_minutes)
    and c.occupied <= (p_date + c.closes) at time zone 'Asia/Bangkok'
    and exists(select 1 from public.barber_schedules s where s.barber_id = c.id and s.weekday = extract(dow from p_date)::integer and s.kind = 'work'
      and c.slot >= (p_date + s.starts) at time zone 'Asia/Bangkok' and c.occupied <= (p_date + s.ends) at time zone 'Asia/Bangkok')
    and not exists(select 1 from public.barber_schedules s where s.barber_id = c.id and s.weekday = extract(dow from p_date)::integer and s.kind = 'break'
      and tstzrange(c.slot, c.occupied, '[)') && tstzrange((p_date + s.starts) at time zone 'Asia/Bangkok', (p_date + s.ends) at time zone 'Asia/Bangkok', '[)'))
    and not exists(select 1 from public.time_off t where (t.barber_id is null or t.barber_id = c.id)
      and tstzrange(c.slot,c.occupied,'[)') && tstzrange(t.starts_at,t.ends_at,'[)'))
    and not exists(select 1 from public.bookings b where b.barber_id = c.id and b.status <> 'cancelled'
      and (p_exclude is null or b.id <> p_exclude) and tstzrange(c.slot,c.occupied,'[)') && tstzrange(b.starts_at,b.occupied_until,'[)'));
$$;

create function public.catalog_read() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mode','live',
    'shop',jsonb_build_object('name',s.name,'address',s.address,'phone',s.phone,'latitude',s.latitude,'longitude',s.longitude,
      'timezone',s.timezone,'rating',s.rating,'reviewCount',s.review_count,'cancellationHours',s.cancellation_hours,
      'slotStepMinutes',s.slot_step_minutes,'minimumNoticeMinutes',s.minimum_notice_minutes,'bookingHorizonDays',s.booking_horizon_days,
      'onlineBookingEnabled',s.online_booking_enabled,'lineUrl',s.line_url,'googleReviewUrl',s.google_review_url,'features',s.features,
      'hours',(select jsonb_agg(jsonb_build_object('weekday',h.weekday,'opens',to_char(h.opens,'HH24:MI'),'closes',to_char(h.closes,'HH24:MI'),'closed',h.closed) order by h.weekday) from public.shop_hours h)),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'description',v.description,'priceBaht',v.price_baht,
      'durationMinutes',v.duration_minutes,'isPlaceholder',v.is_placeholder,'bookable',not v.is_placeholder and v.duration_minutes is not null and v.price_baht is not null) order by v.sort_order,v.id) from public.services v where v.active),'[]'),
    'barbers',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'specialties',b.specialties,'photoUrl',b.photo_url,'isPlaceholder',b.is_placeholder,
      'serviceIds',coalesce((select jsonb_agg(bs.service_id) from public.barber_services bs join public.services v on v.id=bs.service_id and v.active where bs.barber_id=b.id),'[]')) order by b.id) from public.barbers b where b.active),'[]'),
    'gallery',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'imageUrl',g.image_url,'caption',g.caption,'category',g.category,'pairId',g.pair_id,'isPlaceholder',g.is_placeholder) order by g.id) from public.gallery_items g where g.published),'[]')
  ) from public.shop_settings s;
$$;

create function public.availability_read(p_date date, p_service_ids uuid[], p_barber_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare duration integer; settings public.shop_settings; slots jsonb;
begin
  select * into settings from public.shop_settings;
  if not coalesce(settings.online_booking_enabled,false) then perform private.fail('BOOKING_CLOSED'); end if;
  duration := private.validate_services(p_service_ids);
  select coalesce(jsonb_agg(jsonb_build_object('startsAt',x.starts_at,'endsAt',x.ends_at,'barberIds',x.barbers) order by x.starts_at),'[]') into slots
  from (select c.starts_at,c.ends_at,jsonb_agg(c.barber_id order by c.barber_id) as barbers
    from private.slot_candidates(p_date,p_service_ids,p_barber_id,duration,settings.buffer_minutes) c group by c.starts_at,c.ends_at) x;
  return jsonb_build_object('date',p_date,'timezone','Asia/Bangkok','slots',slots);
end;
$$;

create function private.booking_view(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',b.id,'reference',b.reference,'status',b.status,'startsAt',b.starts_at,'endsAt',b.ends_at,
    'barber',jsonb_build_object('id',r.id,'name',r.name),'customerName',c.name,'revision',b.revision,
    'cancellationDeadline',b.starts_at - make_interval(hours => b.cancellation_hours),
    'canChange',b.status='confirmed' and now() < b.starts_at - make_interval(hours => b.cancellation_hours),
    'totalBaht',(select sum(price_baht) from public.booking_services where booking_id=b.id),
    'services',(select jsonb_agg(jsonb_build_object('id',v.service_id,'name',v.name,'priceBaht',v.price_baht,'durationMinutes',v.duration_minutes) order by v.service_id) from public.booking_services v where v.booking_id=b.id))
  from public.bookings b join public.barbers r on r.id=b.barber_id join public.customers c on c.id=b.customer_id where b.id=p_id;
$$;

create function private.enqueue_booking(p_id uuid,p_kind text) returns void language plpgsql set search_path = '' as $$
declare b public.bookings; r integer;
begin
  select * into b from public.bookings where id=p_id;
  update public.notification_jobs set status='cancelled' where booking_id=p_id and status in ('pending','failed');
  insert into public.notification_jobs(booking_id,booking_revision,kind,recipient,due_at)
    values (b.id,b.revision,p_kind,'customer',now()),(b.id,b.revision,p_kind,'owner',now()) on conflict do nothing;
  if b.status='confirmed' then
    foreach r in array array[24,2] loop
      if b.starts_at - make_interval(hours => r) > now() then
        insert into public.notification_jobs(booking_id,booking_revision,kind,recipient,due_at)
        values(b.id,b.revision,'reminder_' || r || 'h','customer',b.starts_at - make_interval(hours => r)) on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

create function public.booking_create(p_input jsonb,p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare settings public.shop_settings; existing public.bookings; selected_ids uuid[]; duration integer;
  chosen record; start_time timestamptz; new_id uuid; customer uuid; requested_barber uuid; key uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(880088);
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then perform private.fail('INVALID_INPUT'); end if;
  key := (p_input->>'idempotencyKey')::uuid;
  select * into existing from public.bookings where idempotency_key=key;
  if found then
    if existing.request_fingerprint <> encode(sha256(convert_to(p_input::text,'UTF8')),'hex') or not exists(select 1 from public.booking_access_tokens where booking_id=existing.id and token_hash=p_token_hash and revoked_at is null and expires_at > now()) then
      perform private.fail('IDEMPOTENCY_CONFLICT');
    end if;
    return jsonb_build_object('booking',private.booking_view(existing.id),'mode','live');
  end if;
  select * into settings from public.shop_settings;
  if not coalesce(settings.online_booking_enabled,false) then perform private.fail('BOOKING_CLOSED'); end if;
  select array_agg(v::uuid order by v) into selected_ids from jsonb_array_elements_text(p_input->'serviceIds') v;
  duration := private.validate_services(selected_ids);
  start_time := (p_input->>'startsAt')::timestamptz;
  requested_barber := (p_input->>'barberId')::uuid;
  select c.* into chosen from private.slot_candidates((start_time at time zone 'Asia/Bangkok')::date,selected_ids,requested_barber,duration,settings.buffer_minutes) c
    where c.starts_at=start_time order by (select count(*) from public.bookings b where b.barber_id=c.barber_id and b.status <> 'cancelled' and (b.starts_at at time zone 'Asia/Bangkok')::date=(start_time at time zone 'Asia/Bangkok')::date),c.barber_id limit 1;
  if not found then perform private.fail('SLOT_UNAVAILABLE'); end if;
  insert into public.customers(name,phone,locale,marketing_opt_in,consent_at)
    values(trim(p_input#>>'{customer,name}'),p_input#>>'{customer,phone}',p_input#>>'{customer,locale}',coalesce((p_input#>>'{customer,marketingOptIn}')::boolean,false),
      case when (p_input#>>'{customer,marketingOptIn}')::boolean then now() else null end) returning id into customer;
  insert into public.bookings(customer_id,barber_id,starts_at,ends_at,occupied_until,note,cancellation_hours,buffer_minutes,idempotency_key,request_fingerprint)
    values(customer,chosen.barber_id,start_time,chosen.ends_at,chosen.ends_at+make_interval(mins => settings.buffer_minutes),nullif(p_input->>'note',''),settings.cancellation_hours,settings.buffer_minutes,key,encode(sha256(convert_to(p_input::text,'UTF8')),'hex')) returning id into new_id;
  insert into public.booking_services(booking_id,service_id,name,price_baht,duration_minutes)
    select new_id,id,name,price_baht,duration_minutes from public.services where id=any(selected_ids);
  insert into public.booking_access_tokens(booking_id,token_hash,expires_at) values(new_id,p_token_hash,chosen.ends_at+interval '30 days');
  perform private.enqueue_booking(new_id,'confirmation');
  insert into public.audit_events(booking_id,actor_kind,action) values(new_id,'customer','created');
  return jsonb_build_object('booking',private.booking_view(new_id),'mode','live');
exception when exclusion_violation then perform private.fail('SLOT_UNAVAILABLE'); return null;
end;
$$;

create function private.require_booking_access(p_id uuid,p_hash text) returns void language plpgsql set search_path = '' as $$
begin
  if p_hash is null or not exists(select 1 from public.booking_access_tokens where booking_id=p_id and token_hash=p_hash and revoked_at is null and expires_at>now()) then
    perform private.fail('INVALID_LINK');
  end if;
end;
$$;
create function public.booking_read(p_booking_id uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform private.require_booking_access(p_booking_id,p_token_hash); return private.booking_view(p_booking_id); end;
$$;
create function public.booking_change(p_booking_id uuid,p_token_hash text,p_action text,p_expected_revision integer,p_starts_at timestamptz default null,p_barber_id uuid default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bookings; chosen record; services uuid[]; duration integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(880088);
  perform private.require_booking_access(p_booking_id,p_token_hash);
  select * into b from public.bookings where id=p_booking_id for update;
  if p_action not in ('cancel','reschedule') or p_action is null then perform private.fail('INVALID_INPUT'); end if;
  -- A repeated cancellation is safe even if its successful HTTP response was lost.
  if p_action='cancel' and b.status='cancelled' then return private.booking_view(b.id); end if;
  -- A repeated successful reschedule returns the same booking, without a second notice.
  if p_action='reschedule' and b.revision=p_expected_revision+1 and b.starts_at=p_starts_at and (p_barber_id is null or b.barber_id=p_barber_id) and b.status='confirmed' then
    return private.booking_view(b.id);
  end if;
  if p_expected_revision is null or b.revision <> p_expected_revision then perform private.fail('STALE_BOOKING'); end if;
  if b.status <> 'confirmed' then perform private.fail('BOOKING_NOT_CHANGEABLE'); end if;
  if now() >= b.starts_at-make_interval(hours => b.cancellation_hours) then perform private.fail('CHANGE_WINDOW_CLOSED'); end if;
  if p_action='cancel' then
    update public.bookings set status='cancelled',cancel_reason=p_reason,revision=revision+1,updated_at=now() where id=b.id;
  else
    select array_agg(service_id),sum(duration_minutes) into services,duration from public.booking_services where booking_id=b.id;
    select c.* into chosen from private.slot_candidates((p_starts_at at time zone 'Asia/Bangkok')::date,services,p_barber_id,duration,b.buffer_minutes,b.id) c
      where c.starts_at=p_starts_at order by c.barber_id limit 1;
    if not found then perform private.fail('SLOT_UNAVAILABLE'); end if;
    if b.starts_at=chosen.starts_at and b.barber_id=chosen.barber_id then return private.booking_view(b.id); end if;
    update public.bookings set starts_at=chosen.starts_at,ends_at=chosen.ends_at,occupied_until=chosen.ends_at+make_interval(mins => b.buffer_minutes),barber_id=chosen.barber_id,revision=revision+1,updated_at=now() where id=b.id;
    update public.booking_access_tokens set expires_at=chosen.ends_at+interval '30 days' where booking_id=b.id;
  end if;
  perform private.enqueue_booking(b.id,case when p_action='cancel' then 'cancellation' else 'reschedule' end);
  insert into public.audit_events(booking_id,actor_kind,action,details)
    values(b.id,'customer',p_action,jsonb_build_object('previousStartsAt',b.starts_at,'previousBarberId',b.barber_id,'previousRevision',b.revision));
  return private.booking_view(b.id);
exception when exclusion_violation then perform private.fail('SLOT_UNAVAILABLE'); return null;
end;
$$;

create function public.rate_limit_consume(p_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_key) > 200 then return false; end if;
  insert into private.rate_limits(key,window_start,hits) values(p_key,now(),1)
  on conflict(key) do update set
    window_start=case when private.rate_limits.window_start <= now()-make_interval(secs => p_window_seconds) then now() else private.rate_limits.window_start end,
    hits=case when private.rate_limits.window_start <= now()-make_interval(secs => p_window_seconds) then 1 else least(private.rate_limits.hits+1,p_limit+1) end
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_owner(), private.can_access_barber(uuid) to authenticated;
revoke all on function public.catalog_read(), public.availability_read(date,uuid[],uuid), public.booking_create(jsonb,text), public.booking_read(uuid,text), public.booking_change(uuid,text,text,integer,timestamptz,uuid,text), public.rate_limit_consume(text,integer,integer) from public,anon,authenticated;
grant execute on function public.catalog_read() to anon,authenticated,service_role;
grant execute on function public.availability_read(date,uuid[],uuid),public.booking_create(jsonb,text),public.booking_read(uuid,text),public.booking_change(uuid,text,text,integer,timestamptz,uuid,text),public.rate_limit_consume(text,integer,integer) to service_role;
