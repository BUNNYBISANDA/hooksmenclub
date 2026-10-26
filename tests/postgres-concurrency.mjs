// Real, separate PostgreSQL sessions. Run ONLY against an empty disposable local database.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.TEST_DATABASE_URL;
if(!url) throw new Error('Set TEST_DATABASE_URL to an empty local hook_menclub_test database. No tests were run.');
const parsed=new URL(url);
if(!['localhost','127.0.0.1','::1','[::1]'].includes(parsed.hostname)||parsed.pathname!=='/hook_menclub_test') throw new Error('Concurrency tests require the disposable local database hook_menclub_test.');
const container=process.env.TEST_PG_CONTAINER;
if(container&&!/^hook-menclub-test-[a-z0-9-]+$/.test(container)) throw new Error('Unexpected test container name.');
function sql(text) {
  return new Promise((resolve,reject)=>{
    const args=['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'];
    const child=spawn(container?'docker':'psql',container?['exec','-i',container,'psql','--username=postgres','--dbname=hook_menclub_test',...args]:args,{
      env:{...process.env,PGDATABASE:url,PGCONNECT_TIMEOUT:'5'},stdio:['pipe','pipe','pipe'],windowsHide:true,
    });
    let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);
    child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));
    child.stdin.end(text);
  });
}
assert.equal(await sql('select current_database()'),'hook_menclub_test');
assert.equal(await sql("select count(*) from pg_tables where schemaname in ('public','auth','private')"),'0','Use a fresh test database; this script never drops existing tables.');
await sql(`
  do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public to anon,authenticated,service_role;
  grant usage on schema auth to authenticated,service_role;
`);
for(const file of ['202610180001_foundation.sql','202610180002_booking_functions.sql','202610180003_manage_availability.sql']) await sql(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
await sql(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
const service='10000000-0000-4000-8000-000000000001',barber='20000000-0000-4000-8000-000000000001';
await sql(`
  update public.shop_settings set online_booking_enabled=true;
  update public.services set is_placeholder=false,price_baht=0,duration_minutes=30 where id='${service}';
  update public.barbers set is_placeholder=false where id='${barber}';
  insert into public.barber_services values('${barber}','${service}');
  insert into public.barber_schedules(barber_id,weekday,starts,ends,kind) select '${barber}',d,'10:30','19:30','work' from generate_series(0,6) d;
`);
const day=await sql("select to_char((now() at time zone 'Asia/Bangkok')::date+3,'YYYY-MM-DD')");
const payload=(time)=>({serviceIds:[service],barberId:barber,startsAt:`${day}T${time}:00+07:00`,idempotencyKey:crypto.randomUUID(),customer:{name:'CONCURRENCY TEST',phone:'+66812345678',locale:'en',marketingOptIn:false},note:''});
const create=p=>`select public.booking_create('${JSON.stringify(p).replaceAll("'","''")}'::jsonb,'${'a'.repeat(64)}');`;
const competing=await Promise.allSettled([sql(create(payload('11:00'))),sql(create(payload('11:00')))]);
assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
assert.equal(competing.filter(r=>r.status==='rejected'&&r.reason.message.includes('SLOT_UNAVAILABLE')).length,1);
assert.equal(await sql('select count(*) from public.bookings'),'1');
const retry=payload('12:00');
const repeated=await Promise.all([sql(create(retry)),sql(create(retry))]);
assert.equal(JSON.parse(repeated[0]).booking.id,JSON.parse(repeated[1]).booking.id);
assert.equal(await sql('select count(*) from public.bookings'),'2');
console.log('PASS: separate sessions cannot double-book; simultaneous idempotent retries create one appointment.');
