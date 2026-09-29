import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateFood } from '../_shared/food.ts';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
Deno.serve(async (request: Request) => {
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if(request.method !== 'POST') return json({error:'Use POST.'},405);
  const authorization=request.headers.get('Authorization');
  if(!authorization || !/^Bearer \S+$/i.test(authorization)) return json({error:'A user access token is required.'},401);
  if(!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return json({error:'Content-Type must be application/json.'},415);
  try {
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await client.auth.getUser(authorization.slice(7));
    if(authError || !user) return json({error:'Invalid or expired user access token.'},401);
    // Bound streamed input too: Content-Length alone can be omitted or forged.
    const reader=request.body?.getReader();
    if(!reader)return json({error:'A JSON body is required.'},400);
    const chunks:Uint8Array[]=[];
    let length=0;
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>16384){await reader.cancel();return json({error:'Request body exceeds 16 KB.'},413);}
      chunks.push(value);
    }
    const bytes=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let food;
    try {food=validateFood(JSON.parse(new TextDecoder().decode(bytes)));}
    catch(error){return json({error:error instanceof Error?error.message:'Invalid food entry.'},400);}
    const {data,error}=await client.from('food_entries').insert({...food,user_id:user.id}).select().single();
    if(error){console.error('add-food database failure',error.code);return json({error:'Unable to save food entry.'},500);}
    return json({entry:data},201);
  } catch {return json({error:'Service temporarily unavailable. Please try again.'},503);}
});
