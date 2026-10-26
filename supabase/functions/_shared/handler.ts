import { availabilitySchema,createBookingSchema,manageSchema } from './validation.ts';

export type Endpoint='catalog'|'availability'|'create-booking'|'manage-booking';
type Rpc = (name:string,args?:Record<string,unknown>) => Promise<{data:unknown;error:{message:string;code?:string}|null}>;
export interface Dependencies {
  rpc:Rpc; env:Record<string,string|undefined>; fetch?:typeof fetch;
}
class HttpError extends Error { constructor(public code:string,public status:number){super(code);} }
const codes:Record<string,number>={INVALID_INPUT:400,SLOT_UNAVAILABLE:409,BOOKING_CLOSED:409,INVALID_LINK:404,CHANGE_WINDOW_CLOSED:409,BOOKING_NOT_CHANGEABLE:409,STALE_BOOKING:409,RATE_LIMITED:429,CAPTCHA_FAILED:400,IDEMPOTENCY_CONFLICT:409,NOT_CONFIGURED:503};
export async function sha256(value:string):Promise<string> {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function readJson(req:Request):Promise<unknown> {
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError('INVALID_INPUT',415);
  if(Number(req.headers.get('content-length')??0)>16384) throw new HttpError('INVALID_INPUT',413);
  const reader=req.body?.getReader();if(!reader) throw new HttpError('INVALID_INPUT',400);
  let size=0;const chunks:Uint8Array[]=[];
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new HttpError('INVALID_INPUT',413);}chunks.push(value);}
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {throw new HttpError('INVALID_INPUT',400);}
}
export function createHandler(endpoint:Endpoint,deps:Dependencies):(req:Request)=>Promise<Response> {
  const perform=async(name:string,args?:Record<string,unknown>)=>{
    const {data,error}=await deps.rpc(name,args);
    if(error) throw new HttpError(error.message in codes ? error.message : 'INTERNAL_ERROR',codes[error.message]??500);
    return data;
  };
  const rateLimit=async(key:string,limit:number,window:number)=>{
    if(!(await perform('rate_limit_consume',{p_key:key,p_limit:limit,p_window_seconds:window}))) throw new HttpError('RATE_LIMITED',429);
  };
  return async(req:Request)=>{
    const allowed=deps.env.APP_ORIGIN;
    const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    const origin=req.headers.get('origin');
    if(allowed&&origin===allowed) headers['Access-Control-Allow-Origin']=allowed;
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='content-type, apikey, authorization, x-client-info';
    try {
      if(!allowed) throw new HttpError('NOT_CONFIGURED',503);
      if(origin&&origin!==allowed) throw new HttpError('INVALID_INPUT',403);
      if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
      if(req.method!=='POST') throw new HttpError('INVALID_INPUT',405);
      const raw=await readJson(req);
      await rateLimit(`global:${endpoint}`,endpoint==='create-booking'?60:600,60);
      let data:unknown;
      if(endpoint==='catalog') {
        data=await perform('catalog_read');if(!data)throw new HttpError('NOT_CONFIGURED',503);
      } else if(endpoint==='availability') {
        const parsed=availabilitySchema.safeParse(raw);if(!parsed.success) throw new HttpError('INVALID_INPUT',400);
        data=await perform('availability_read',{p_date:parsed.data.date,p_service_ids:parsed.data.serviceIds,p_barber_id:parsed.data.barberId});
      } else if(endpoint==='create-booking') {
        const parsed=createBookingSchema.safeParse(raw);if(!parsed.success) throw new HttpError('INVALID_INPUT',400);
        const secret=deps.env.TURNSTILE_SECRET_KEY,hostname=deps.env.TURNSTILE_EXPECTED_HOSTNAME,salt=deps.env.RATE_LIMIT_SALT;
        if(!secret||!hostname||!salt||salt.length<32)throw new HttpError('NOT_CONFIGURED',503);
        const {turnstileToken,manageToken,...input}=parsed.data;
        // Phone keys use a secret salt; neither raw numbers nor raw tokens are stored in rate-limit keys.
        await rateLimit(`phone:${await sha256(salt+input.customer.phone)}`,5,3600);
        let challenge:Response;
        try {
          challenge=await (deps.fetch??fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
            method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
            body:new URLSearchParams({secret,response:turnstileToken}),signal:AbortSignal.timeout(10000),
          });
        } catch {throw new HttpError('CAPTCHA_FAILED',400);}
        const verdict=await challenge.json().catch(()=>null);
        if(!challenge.ok||!verdict?.success||verdict.hostname!==hostname||verdict.action!=='booking')throw new HttpError('CAPTCHA_FAILED',400);
        data=await perform('booking_create',{p_input:input,p_token_hash:await sha256(manageToken)});
      } else {
        const parsed=manageSchema.safeParse(raw);if(!parsed.success) throw new HttpError('INVALID_INPUT',400);
        const input=parsed.data;
        await rateLimit(`manage:${input.bookingId}`,60,60);
        const hash=await sha256(input.token);
        if(input.action==='availability') data=await perform('booking_availability_read',{p_booking_id:input.bookingId,p_token_hash:hash,p_date:input.date,p_barber_id:input.barberId});
        else if(input.action==='read') data=await perform('booking_read',{p_booking_id:input.bookingId,p_token_hash:hash});
        else data=await perform('booking_change',{
          p_booking_id:input.bookingId,p_token_hash:hash,p_action:input.action,p_expected_revision:input.expectedRevision,
          p_starts_at:input.action==='reschedule'?input.startsAt:null,p_barber_id:input.action==='reschedule'?input.barberId:null,
          p_reason:input.action==='cancel'?input.reason??null:null,
        });
      }
      return new Response(JSON.stringify({data}),{status:200,headers});
    } catch(error) {
      const known=error instanceof HttpError;
      if(known&&error.status===429) headers['Retry-After']='60';
      return new Response(JSON.stringify({error:{code:known?error.code:'INTERNAL_ERROR'}}),{status:known?error.status:500,headers});
    }
  };
}
