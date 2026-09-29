import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { validateFood } from '../_shared/food.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store'}});

Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'Use POST.'},405);
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return json({error:'Please sign in again.'},401);
  if(Number(request.headers.get('Content-Length')||0)>12_000_000)return json({error:'Photo is too large.'},413);
  const apiKey=Deno.env.get('OPENAI_API_KEY');
  if(!apiKey)return json({error:'Photo analysis needs an OpenAI API key in the project settings.'},503);
  try{
    const body=await request.json();
    if(typeof body.image!=='string'||body.image.length>11_000_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image))return json({error:'Use a JPG, PNG, or WebP photo under 8 MB.'},400);
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await client.auth.getUser(authorization.slice(7));
    if(authError||!user)return json({error:'Please sign in again.'},401);
    const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:'gpt-6-luna',store:false,max_output_tokens:400,
      input:[{role:'user',content:[{type:'input_text',text:'Identify the visible meal and estimate total calories, protein, carbohydrates, and fat for the full visible portion. Be practical and concise. Put assumptions about portion size in notes.'},{type:'input_image',image_url:body.image,detail:'high'}]}],
      text:{format:{type:'json_schema',name:'nutrition_estimate',strict:true,schema:{type:'object',additionalProperties:false,properties:{name:{type:'string'},calories:{type:'integer'},protein:{type:'number'},carbs:{type:'number'},fat:{type:'number'},notes:{type:'string'}},required:['name','calories','protein','carbs','fat','notes']}}}
    })});
    if(!ai.ok){console.error('OpenAI photo analysis failed',ai.status);return json({error:'AI could not analyze this photo. Please try another image.'},502);}
    const response=await ai.json();
    const text=response.output?.flatMap((item:{content?:unknown[]})=>item.content??[]).find((item:{type?:string})=>item.type==='output_text')?.text;
    if(typeof text!=='string')return json({error:'AI returned no nutrition estimate.'},502);
    const estimate=JSON.parse(text);
    const food=validateFood({...estimate,eaten_at:body.eaten_at,source:'chat'});
    const {data,error}=await client.from('food_entries').insert({...food,user_id:user.id}).select().single();
    if(error){console.error('photo insert failed',error.code);return json({error:'Could not save this meal.'},500);}
    return json({entry:data},201);
  }catch{return json({error:'Could not analyze this photo.'},400);}
});
