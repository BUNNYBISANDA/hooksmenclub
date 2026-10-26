import { createClient } from '@supabase/supabase-js';
import { createHandler,type Endpoint } from './handler.ts';

export function serve(endpoint:Endpoint) {
  const env=Deno.env.toObject();
  // Construct lazily: missing deployment configuration produces a safe 503, not a fake success.
  Deno.serve(async(req:Request)=>{
    if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({error:{code:'NOT_CONFIGURED'}}),{
      status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
    });
    const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    return createHandler(endpoint,{env,rpc:async(name,args)=>{
      const {data,error}=await db.rpc(name,args);return {data,error};
    }})(req);
  });
}
