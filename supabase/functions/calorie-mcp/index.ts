import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js';
import { z } from 'npm:zod@4.1.13';
import { validateFood } from '../_shared/food.ts';

const projectUrl = Deno.env.get('SUPABASE_URL')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const resource = `${projectUrl}/functions/v1/calorie-mcp`;
const metadataUrl = `${resource}/.well-known/oauth-protected-resource`;
const challenge = `Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="Sign in to Calorie Tracker"`;
const authError = () => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: 'Connect your Calorie Tracker account to continue.' }],
  _meta: { 'mcp/www_authenticate': [challenge] },
});

function createServer(authorization: string | null) {
  const server = new McpServer(
    { name: 'Calorie Tracker', version: '1.0.0' },
    { instructions: 'When the user describes food, estimate calories and protein, carbs, and fat in grams, then use log_food. State that values are estimates. Ask a follow-up only when the food or quantity is too unclear to make a useful estimate.' },
  );
  let auth: Promise<ReturnType<typeof createClient<any>> | null> | undefined;
  const client = () => auth ??= (async () => {
    if (!authorization?.startsWith('Bearer ')) return null;
    const supabase = createClient(projectUrl, publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await supabase.auth.getUser(authorization.slice(7));
    return error || !user ? null : supabase;
  })();

  server.registerTool('log_food', {
    title: 'Log food',
    description: 'Estimate nutrition from the user’s meal description and save it to Calorie Tracker. Use after the user says what they ate or drank. Use the current time unless they specify another time.',
    inputSchema: {
      name: z.string().min(1).max(200).describe('Concise food or meal name based on what the user said'),
      calories: z.number().int().min(0).max(100000).describe('Estimated kilocalories'),
      protein: z.number().min(0).max(100000).describe('Estimated protein in grams'),
      carbs: z.number().min(0).max(100000).describe('Estimated carbohydrates in grams'),
      fat: z.number().min(0).max(100000).describe('Estimated fat in grams'),
      eaten_at: z.string().describe('ISO 8601 date/time including timezone offset'),
      notes: z.string().max(2000).optional().describe('Optional short assumptions behind the estimate'),
    },
    outputSchema: { id: z.string(), name: z.string(), calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), eaten_at: z.string() },
    // Back-compatible mirror used until the base MCP SDK emits the top-level extension.
    _meta: { securitySchemes: [{ type: 'oauth2', scopes: [] }] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => {
    const supabase = await client();
    if (!supabase) return authError();
    let food;
    try { food = validateFood({ ...input, source: 'chat' }); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Invalid food entry.' }] }; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return authError();
    const { data, error } = await supabase.from('food_entries').insert({ ...food, user_id: user.id }).select('id,name,calories,protein,carbs,fat,eaten_at').single();
    if (error) return { isError: true, content: [{ type: 'text', text: 'The meal could not be saved. Please try again.' }] };
    return { content: [{ type: 'text', text: `Logged ${data.name}: ${data.calories} kcal, ${data.protein}g protein, ${data.carbs}g carbs, ${data.fat}g fat.` }], structuredContent: data };
  });
  return server;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return Response.json({ resource, authorization_servers: [`${projectUrl}/auth/v1`], resource_documentation: 'https://noelperland.github.io/calorie-tracker/' }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }
  if (request.method === 'GET') return Response.json({ name: 'Calorie Tracker MCP', mcp: resource });
  const server = createServer(request.headers.get('Authorization'));
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(request);
});
