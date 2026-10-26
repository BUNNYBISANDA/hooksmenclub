import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { Availability, BookingView, Catalog, CreateBookingResult } from '../src/types/api';
import { createHandler,type Endpoint } from '../supabase/functions/_shared/handler';

let db: PGlite;
const S1='10000000-0000-4000-8000-000000000001', S2='10000000-0000-4000-8000-000000000002';
const B1='20000000-0000-4000-8000-000000000001', B2='20000000-0000-4000-8000-000000000002';
const U1='40000000-0000-4000-8000-000000000001', U2='40000000-0000-4000-8000-000000000002';
const HASH='a'.repeat(64);
let date: string;
const instant=(time:string)=>new Date(`${date}T${time}:00+07:00`).toISOString().replace('.000Z','+00:00');
async function rpc<T>(sql:string,params:unknown[]=[]):Promise<T> { return (await db.query<{value:T}>(`select ${sql} as value`,params)).rows[0].value; }
const available=(ids=[S1],barber:string|null=B1)=>rpc<Availability>('public.availability_read($1::date,$2::uuid[],$3::uuid)',[date,ids,barber]);
const input=(time='11:00',barber:string|null=B1,ids=[S1])=>({serviceIds:ids,barberId:barber,startsAt:instant(time),idempotencyKey:crypto.randomUUID(),customer:{name:'Synthetic test customer',phone:'+66812345678',locale:'th',marketingOptIn:false},note:''});
const create=(value=input(),hash=HASH)=>rpc<CreateBookingResult>('public.booking_create($1::jsonb,$2)',[JSON.stringify(value),hash]);
const change=(booking:BookingView,action='cancel',time:string|null=null,barber:string|null=B1,revision=booking.revision)=>rpc<BookingView>('public.booking_change($1::uuid,$2,$3,$4,$5::timestamptz,$6::uuid,$7)',[booking.id,HASH,action,revision,time?instant(time):null,barber,null]);

beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}});
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
  `);
  for(const file of ['202610180001_foundation.sql','202610180002_booking_functions.sql','202610180003_manage_availability.sql'])
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  date=await rpc<string>(`to_char((now() at time zone 'Asia/Bangkok')::date+3,'YYYY-MM-DD')`);
});
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);
    truncate public.audit_events,public.notification_jobs,public.notifications_log,public.reviews_requests,public.booking_access_tokens,public.booking_services,public.bookings,public.privacy_requests,public.customer_channels,public.customers,public.barber_schedules,public.time_off,public.barber_services,public.staff_profiles,public.services,public.barbers,auth.users,private.rate_limits cascade;
    update public.shop_settings set online_booking_enabled=true,cancellation_hours=4,buffer_minutes=0,minimum_notice_minutes=0,booking_horizon_days=60;
    update public.shop_hours set opens='10:30',closes='19:30',closed=false;
    insert into public.services(id,name,price_baht,duration_minutes,is_placeholder) values
      ('${S1}','{"th":"TEST","en":"TEST"}',100,30,false),('${S2}','{"th":"TEST2","en":"TEST2"}',50,15,false);
    insert into public.barbers(id,name,is_placeholder) values ('${B1}','{"th":"TEST1","en":"TEST1"}',false),('${B2}','{"th":"TEST2","en":"TEST2"}',false);
    insert into public.barber_services select b.id,s.id from public.barbers b cross join public.services s;
    insert into public.barber_schedules(barber_id,weekday,starts,ends,kind) select b.id,d,'10:30','19:30','work' from public.barbers b cross join generate_series(0,6) d;
  `);
});

describe('database availability and booking invariants',()=>{
  it('executes the complete HTTP booking lifecycle against the real SQL functions',async()=>{
    const request=async(endpoint:Endpoint,body:unknown)=>{
      const handler=createHandler(endpoint,{
        env:{APP_ORIGIN:'https://test.example',TURNSTILE_SECRET_KEY:'test-secret',TURNSTILE_EXPECTED_HOSTNAME:'test.example',RATE_LIMIT_SALT:'test-only-salt-long-enough-for-validation'},
        fetch:async()=>new Response(JSON.stringify({success:true,hostname:'test.example',action:'booking'})),
        rpc:async(name,args={})=>{
          try {
            const keys=Object.keys(args);
            const values=Object.values(args).map(value=>value&&typeof value==='object'&&!Array.isArray(value)?JSON.stringify(value):value);
            const data=await rpc(`public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')})`,values);
            return {data,error:null};
          } catch(error) {return {data:null,error:{message:(error as Error).message}};}
        },
      });
      return handler(new Request('https://test.example',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    };
    const token='d'.repeat(43);
    const created=await request('create-booking',{...input(),turnstileToken:'test-verification',manageToken:token});expect(created.status).toBe(200);
    const {data:{booking}}=await created.json();
    const view=await request('manage-booking',{action:'read',bookingId:booking.id,token});expect(view.status).toBe(200);
    const slots=await request('manage-booking',{action:'availability',bookingId:booking.id,token,date,barberId:B1});expect(slots.status).toBe(200);
    const changed=await request('manage-booking',{action:'reschedule',bookingId:booking.id,token,startsAt:instant('13:00'),barberId:B1,expectedRevision:1});expect(changed.status).toBe(200);
    const cancelled=await request('manage-booking',{action:'cancel',bookingId:booking.id,token,expectedRevision:2});expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).data.status).toBe('cancelled');
  });
  it('returns only public catalog fields and all seven daily hours',async()=>{
    const c=await rpc<Catalog>('public.catalog_read()');
    expect(c.shop.name).toBe('Hook Menclub');expect(c.shop.hours).toHaveLength(7);expect(c.mode).toBe('live');expect(c.services).toHaveLength(2);
  });
  it('keeps placeholders unbookable and online bookings disabled in the production seed',async()=>{
    await db.exec(`truncate public.barber_services,public.services cascade; update public.shop_settings set online_booking_enabled=false;`);
    await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
    const c=await rpc<Catalog>('public.catalog_read()');
    expect(c.services[0].priceBaht).toBeNull();expect(c.services[0].durationMinutes).toBeNull();expect(c.services[0].bookable).toBe(false);
    await expect(available()).rejects.toThrow('BOOKING_CLOSED');
  });
  it('combines service durations and fits the entire appointment before closing',async()=>{
    const a=await available([S1,S2]);
    expect(a.slots[0].startsAt).toBe(instant('10:30'));
    expect(a.slots.at(-1)!.startsAt).toBe(instant('18:45'));
    expect(Date.parse(a.slots[0].endsAt)-Date.parse(a.slots[0].startsAt)).toBe(45*60000);
  });
  it('excludes breaks, barber time off and shop-wide closures',async()=>{
    await db.query(`insert into public.barber_schedules(barber_id,weekday,starts,ends,kind) values($1,extract(dow from $2::date),'12:00','13:00','break')`,[B1,date]);
    await db.query(`insert into public.time_off(barber_id,starts_at,ends_at) values($1,$2,$3),(null,$4,$5)`,[B1,instant('14:00'),instant('15:00'),instant('16:00'),instant('17:00')]);
    const a=await available();const times=a.slots.map(s=>s.startsAt);
    for(const t of ['11:45','12:00','12:45','13:45','14:30','15:45','16:30']) expect(times).not.toContain(instant(t));
    expect(times).toContain(instant('13:00'));expect(times).toContain(instant('17:00'));
  });
  it('accounts for cleanup buffer and barber capability',async()=>{
    await db.exec(`update public.shop_settings set buffer_minutes=15; delete from public.barber_services where barber_id='${B2}' and service_id='${S2}'`);
    const a=await available([S1,S2],null);expect(a.slots.at(-1)!.startsAt).toBe(instant('18:30'));
    expect(a.slots.every(s=>s.barberIds.length===1&&s.barberIds[0]===B1)).toBe(true);
  });
  it('rejects repeated/placeholder services and off-grid starts',async()=>{
    await expect(available([S1,S1])).rejects.toThrow('INVALID_INPUT');
    await expect(create(input('11:07'))).rejects.toThrow('SLOT_UNAVAILABLE');
    await db.exec(`update public.services set is_placeholder=true where id='${S1}'`);
    await expect(create()).rejects.toThrow('INVALID_INPUT');
  });
  it('rejects dates outside the horizon, past dates and days without schedules',async()=>{
    const a=await rpc<Availability>(`public.availability_read(((now() at time zone 'Asia/Bangkok')::date+61),$1::uuid[],null)`,[[S1]]);expect(a.slots).toEqual([]);
    const b=await rpc<Availability>(`public.availability_read(((now() at time zone 'Asia/Bangkok')::date-1),$1::uuid[],null)`,[[S1]]);expect(b.slots).toEqual([]);
    await db.exec('delete from public.barber_schedules');expect((await available()).slots).toEqual([]);
  });
  it('prevents double booking while permitting adjacent appointments',async()=>{
    await create(input('11:00'));
    await expect(create(input('11:15'))).rejects.toThrow('SLOT_UNAVAILABLE');
    expect((await create(input('11:30'))).booking.status).toBe('confirmed');
  });
  it('enforces an overlap constraint even when bypassing the booking function',async()=>{
    const b=(await create()).booking;
    await expect(db.query(`insert into public.bookings(customer_id,barber_id,starts_at,ends_at,occupied_until,cancellation_hours,buffer_minutes,idempotency_key,request_fingerprint)
      select customer_id,barber_id,starts_at,ends_at,occupied_until,cancellation_hours,buffer_minutes,gen_random_uuid(),'{}' from public.bookings where id=$1`,[b.id])).rejects.toMatchObject({code:'23P01'});
  });
  it('assigns any-available requests to different barbers when one is occupied',async()=>{
    const one=(await create(input('11:00',null))).booking;
    const two=(await create(input('11:00',null))).booking;
    expect(one.barber.id).not.toBe(two.barber.id);
    await expect(create(input('11:00',null))).rejects.toThrow('SLOT_UNAVAILABLE');
  });
  it('deduplicates retries and rejects mismatched idempotency keys/tokens',async()=>{
    const request=input();const a=await create(request),b=await create(request);
    expect(a.booking.id).toBe(b.booking.id);
    expect(await rpc<number>('(select count(*)::int from public.bookings)')).toBe(1);
    await expect(create({...request,note:'Changed'})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(create(request,'b'.repeat(64))).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('does not overwrite an earlier customer profile when a phone is reused',async()=>{
    const a=(await create()).booking;
    await create({...input('12:00'),customer:{...input().customer,name:'Another person'}});
    const first=await rpc<BookingView>('public.booking_read($1::uuid,$2)',[a.id,HASH]);expect(first.customerName).toBe('Synthetic test customer');
  });
  it('rolls back a failed reschedule without losing the original booking',async()=>{
    const a=(await create()).booking;await create(input('12:00'));
    await expect(change(a,'reschedule','12:00')).rejects.toThrow('SLOT_UNAVAILABLE');
    const after=await rpc<BookingView>('public.booking_read($1::uuid,$2)',[a.id,HASH]);expect(after.startsAt).toBe(a.startsAt);expect(after.revision).toBe(1);
  });
  it('reschedules atomically, keeps snapshots and cancels stale reminders',async()=>{
    const a=(await create()).booking;
    await db.exec(`update public.services set price_baht=999,duration_minutes=90 where id='${S1}'`);
    const b=await change(a,'reschedule','13:00');expect(b.totalBaht).toBe(100);expect(b.services[0].durationMinutes).toBe(30);expect(b.revision).toBe(2);
    const old=await rpc<number>(`(select count(*)::int from public.notification_jobs where booking_id=$1 and booking_revision=1 and status='pending')`,[a.id]);expect(old).toBe(0);
    const again=await change(a,'reschedule','13:00');expect(again.revision).toBe(2);
    await expect(change(a,'reschedule','14:00')).rejects.toThrow('STALE_BOOKING');
  });
  it('cancels idempotently and makes the appointment time available',async()=>{
    const a=(await create()).booking;expect((await change(a)).status).toBe('cancelled');expect((await change(a)).revision).toBe(2);
    expect((await available()).slots.map(s=>s.startsAt)).toContain(a.startsAt);
    await expect(change({...a,revision:2},'reschedule','14:00')).rejects.toThrow('BOOKING_NOT_CHANGEABLE');
  });
  it('previews reschedules using original snapshots and excludes only the managed booking',async()=>{
    const a=(await create()).booking;await create(input('12:00'));
    await db.exec(`update public.services set duration_minutes=90,active=false where id='${S1}'`);
    const managed=await rpc<Availability>('public.booking_availability_read($1::uuid,$2,$3::date,$4::uuid)',[a.id,HASH,date,B1]);
    expect(managed.slots.map(s=>s.startsAt)).toContain(instant('11:00'));
    expect(managed.slots.map(s=>s.startsAt)).not.toContain(instant('12:00'));
    expect(Date.parse(managed.slots[0].endsAt)-Date.parse(managed.slots[0].startsAt)).toBe(30*60000);
    await expect(rpc('public.booking_availability_read($1::uuid,$2,$3::date,$4::uuid)',[a.id,'b'.repeat(64),date,B1])).rejects.toThrow('INVALID_LINK');
  });
  it('rejects changes at the exact deadline',async()=>{
    const a=(await create()).booking;
    await db.exec('begin');
    try {
      await db.query(`update public.bookings set starts_at=now()+interval '4 hours',ends_at=now()+interval '4 hours 30 minutes',occupied_until=now()+interval '4 hours 30 minutes' where id=$1`,[a.id]);
      expect((await rpc<BookingView>('public.booking_read($1::uuid,$2)',[a.id,HASH])).canChange).toBe(false);
      await expect(change(a)).rejects.toThrow('CHANGE_WINDOW_CLOSED');
    } finally { await db.exec('rollback'); }
  });
  it('rejects invalid, revoked and expired management tokens without revealing existence',async()=>{
    const a=(await create()).booking;
    await expect(rpc('public.booking_read($1::uuid,$2)',[a.id,'bad'])).rejects.toThrow('INVALID_LINK');
    await db.query('update public.booking_access_tokens set expires_at=now()-interval \'1 second\' where booking_id=$1',[a.id]);
    await expect(rpc('public.booking_read($1::uuid,$2)',[a.id,HASH])).rejects.toThrow('INVALID_LINK');
    await db.query('update public.booking_access_tokens set expires_at=now()+interval \'1 day\',revoked_at=now() where booking_id=$1',[a.id]);
    await expect(rpc('public.booking_read($1::uuid,$2)',[a.id,HASH])).rejects.toThrow('INVALID_LINK');
  });
  it('enforces rate limits and renews expired windows',async()=>{
    expect(await rpc('public.rate_limit_consume($1,2,60)',['test'])).toBe(true);
    expect(await rpc('public.rate_limit_consume($1,2,60)',['test'])).toBe(true);
    expect(await rpc('public.rate_limit_consume($1,2,60)',['test'])).toBe(false);
    await db.exec(`update private.rate_limits set window_start=now()-interval '61 seconds'`);
    expect(await rpc('public.rate_limit_consume($1,2,60)',['test'])).toBe(true);
  });
});

describe('database access control',()=>{
  it('denies anonymous customers, bookings, tokens and mutation RPC access',async()=>{
    await create();await db.exec('set role anon');
    expect((await db.query('select * from public.services')).rows).toHaveLength(2);
    for(const table of ['customers','bookings','booking_access_tokens']) await expect(db.query(`select * from public.${table}`)).rejects.toMatchObject({code:'42501'});
    await expect(create()).rejects.toMatchObject({code:'42501'});
    await expect(available()).rejects.toMatchObject({code:'42501'});
  });
  it('limits barbers to assigned appointments and prevents self promotion/direct mutations',async()=>{
    await create();await create(input('11:00',B2));
    await db.exec(`insert into auth.users values('${U1}'),('${U2}'); insert into public.staff_profiles(user_id,role,barber_id) values('${U1}','barber','${B1}'),('${U2}','owner',null); set role authenticated; select set_config('request.jwt.claim.sub','${U1}',false)`);
    expect((await db.query('select * from public.bookings')).rows).toHaveLength(1);
    expect((await db.query('select * from public.customers')).rows).toHaveLength(1);
    expect((await db.query('select * from public.booking_services')).rows).toHaveLength(1);
    await expect(db.query(`update public.staff_profiles set role='owner'`)).rejects.toMatchObject({code:'42501'});
    await expect(db.query(`update public.bookings set status='cancelled'`)).rejects.toMatchObject({code:'42501'});
    await db.exec(`select set_config('request.jwt.claim.sub','${U2}',false)`);
    expect((await db.query('select * from public.bookings')).rows).toHaveLength(2);
    await expect(db.query('select * from public.booking_access_tokens')).rejects.toMatchObject({code:'42501'});
  });
  it('grants authenticated nonstaff no customer or booking records',async()=>{
    await create();await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U1}',false)`);
    expect((await db.query('select * from public.bookings')).rows).toHaveLength(0);
    expect((await db.query('select * from public.customers')).rows).toHaveLength(0);
  });
});
