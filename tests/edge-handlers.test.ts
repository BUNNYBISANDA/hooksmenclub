import { describe,expect,it,vi } from 'vitest';
import { createHandler,sha256,type Dependencies } from '../supabase/functions/_shared/handler';
import { createBookingSchema,availabilitySchema } from '../supabase/functions/_shared/validation';
const env={APP_ORIGIN:'https://example.test',TURNSTILE_SECRET_KEY:'test-only-secret',TURNSTILE_EXPECTED_HOSTNAME:'example.test',RATE_LIMIT_SALT:'test-only-salt-do-not-use-in-production'};
const input={serviceIds:['10000000-0000-4000-8000-000000000001'],barberId:null,startsAt:'2030-01-01T10:30:00+07:00',customer:{name:' Test ',phone:'081 234 5678',locale:'th',marketingOptIn:false},turnstileToken:'test-challenge',idempotencyKey:'40000000-0000-4000-8000-000000000001',manageToken:'a'.repeat(43)};
const request=(value:unknown,origin=env.APP_ORIGIN)=>new Request('https://api.test',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(value)});
const setup=()=>{
  const rpc=vi.fn<Dependencies['rpc']>(async(name)=>({data:name==='rate_limit_consume'?true:{ok:true},error:null}));
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({success:true,hostname:'example.test',action:'booking'}),{status:200}));
  return {rpc,fetcher,handler:createHandler('create-booking',{env,rpc,fetch:fetcher})};
};
describe('edge booking boundary',()=>{
  it('validates Thai phones, actual dates, duplicate services and unknown fields',()=>{
    const p=createBookingSchema.parse(input);expect(p.customer.phone).toBe('+66812345678');expect(p.customer.name).toBe('Test');expect(p.startsAt).toBe('2030-01-01T03:30:00.000Z');
    expect(createBookingSchema.safeParse({...input,serviceIds:[...input.serviceIds,...input.serviceIds]}).success).toBe(false);
    expect(createBookingSchema.safeParse({...input,customer:{...input.customer,phone:'12345'}}).success).toBe(false);
    expect(createBookingSchema.safeParse({...input,status:'completed'}).success).toBe(false);
    expect(availabilitySchema.safeParse({serviceIds:input.serviceIds,barberId:null,date:'2030-02-30'}).success).toBe(false);
  });
  it('verifies CAPTCHA before writes and sends only hashed tokens to PostgreSQL',async()=>{
    const {handler,rpc,fetcher}=setup();const response=await handler(request(input));expect(response.status).toBe(200);expect(fetcher).toHaveBeenCalledOnce();
    const call=rpc.mock.calls.find(([name])=>name==='booking_create')!;
    expect(call[1]?.p_token_hash).toBe(await sha256(input.manageToken));
    expect(call[1]?.p_input).not.toHaveProperty('turnstileToken');expect(call[1]?.p_input).not.toHaveProperty('manageToken');
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(input.manageToken);
    expect(response.headers.get('Cache-Control')).toBe('no-store');expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.APP_ORIGIN);
  });
  it.each([{success:false,hostname:'example.test',action:'booking'},{success:true,hostname:'evil.test',action:'booking'},{success:true,hostname:'example.test',action:'other'}])('rejects invalid CAPTCHA verdict %j',async(verdict)=>{
    const {handler,rpc,fetcher}=setup();fetcher.mockResolvedValue(new Response(JSON.stringify(verdict)));
    expect((await handler(request(input))).status).toBe(400);expect(rpc.mock.calls.some(([name])=>name==='booking_create')).toBe(false);
  });
  it('fails closed if CAPTCHA or salt is missing',async()=>{
    const {rpc,fetcher}=setup();const handler=createHandler('create-booking',{env:{APP_ORIGIN:env.APP_ORIGIN},rpc,fetch:fetcher});
    const res=await handler(request(input));expect(res.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
  });
  it('enforces rate limits without exposing private provider/database errors',async()=>{
    const {handler,rpc}=setup();rpc.mockResolvedValue({data:false,error:null});const limited=await handler(request(input));expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).toBe('60');
    rpc.mockResolvedValue({data:null,error:{message:'sensitive customer details'}});const failed=await handler(request(input));expect(failed.status).toBe(500);expect(await failed.text()).not.toContain('sensitive');
  });
  it('rejects disallowed origins and bodies larger than 16 KiB',async()=>{
    const {handler,rpc}=setup();expect((await handler(request(input,'https://evil.test'))).status).toBe(403);
    expect((await handler(request({padding:'x'.repeat(17000)}))).status).toBe(413);expect(rpc).not.toHaveBeenCalled();
  });
  it('handles preflight and rejects wrong methods/content types',async()=>{
    const {handler}=setup();expect((await handler(new Request('https://api.test',{method:'OPTIONS',headers:{origin:env.APP_ORIGIN}}))).status).toBe(204);
    expect((await handler(new Request('https://api.test'))).status).toBe(405);
    expect((await handler(new Request('https://api.test',{method:'POST',body:'{}'}))).status).toBe(415);
  });
  it('passes management mutations through the controlled function with a token hash',async()=>{
    const {rpc}=setup();const handler=createHandler('manage-booking',{env,rpc});
    const response=await handler(request({action:'cancel',bookingId:input.idempotencyKey,token:input.manageToken,expectedRevision:1,reason:'Changed plans'}));
    expect(response.status).toBe(200);const call=rpc.mock.calls.find(([name])=>name==='booking_change')!;
    expect(call[1]).toMatchObject({p_action:'cancel',p_expected_revision:1,p_reason:'Changed plans',p_token_hash:await sha256(input.manageToken)});
  });
  it('maps stale/conflicting SQL results to stable public errors',async()=>{
    const {rpc}=setup();rpc.mockImplementation(async name=>name==='rate_limit_consume'?{data:true,error:null}:{data:null,error:{message:'STALE_BOOKING'}});
    const handler=createHandler('manage-booking',{env,rpc});const res=await handler(request({action:'cancel',bookingId:input.idempotencyKey,token:input.manageToken,expectedRevision:1}));
    expect(res.status).toBe(409);expect(await res.json()).toEqual({error:{code:'STALE_BOOKING'}});
  });
});
