-- Preserve appointment snapshots and exclude only the authenticated customer's own booking.
create function public.booking_availability_read(p_booking_id uuid,p_token_hash text,p_date date,p_barber_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bookings; selected_ids uuid[]; duration integer; slots jsonb;
begin
  perform private.require_booking_access(p_booking_id,p_token_hash);
  select * into b from public.bookings where id=p_booking_id;
  if b.status <> 'confirmed' then perform private.fail('BOOKING_NOT_CHANGEABLE'); end if;
  if now() >= b.starts_at-make_interval(hours=>b.cancellation_hours) then perform private.fail('CHANGE_WINDOW_CLOSED'); end if;
  if not (select online_booking_enabled from public.shop_settings) then perform private.fail('BOOKING_CLOSED'); end if;
  select array_agg(service_id),sum(duration_minutes) into selected_ids,duration from public.booking_services where booking_id=b.id;
  select coalesce(jsonb_agg(jsonb_build_object('startsAt',x.starts_at,'endsAt',x.ends_at,'barberIds',x.barbers) order by x.starts_at),'[]') into slots
  from (select c.starts_at,c.ends_at,jsonb_agg(c.barber_id order by c.barber_id) as barbers
    from private.slot_candidates(p_date,selected_ids,p_barber_id,duration,b.buffer_minutes,b.id) c group by c.starts_at,c.ends_at) x;
  return jsonb_build_object('date',p_date,'timezone','Asia/Bangkok','slots',slots);
end;
$$;
revoke all on function public.booking_availability_read(uuid,text,date,uuid) from public,anon,authenticated;
grant execute on function public.booking_availability_read(uuid,text,date,uuid) to service_role;
