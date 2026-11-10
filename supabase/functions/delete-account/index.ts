import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json({ error: 'Sign in before deleting your account.' }, 401);
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return json({ error: 'Send JSON.' }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Confirmation is required.' }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024) { await reader.cancel(); return json({ error: 'Request is too large.' }, 413); }
      chunks.push(value);
    }
    let body: { confirm?: string };
    try { body = JSON.parse(new TextDecoder().decode(new Uint8Array(chunks.flatMap(chunk => [...chunk])))); }
    catch { return json({ error: 'Confirmation is required.' }, 400); }
    if (body?.confirm !== 'DELETE') return json({ error: 'Confirmation is required.' }, 400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ error: 'Your session expired. Sign in again.' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) { console.error('delete-account failure', error.code); return json({ error: 'Account deletion failed. Try again.' }, 503); }
    return json({ deleted: true }, 200);
  } catch { return json({ error: 'Account deletion failed. Try again.' }, 503); }
});
