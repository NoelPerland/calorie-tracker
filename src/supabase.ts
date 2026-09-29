import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key && !url.includes('YOUR_PROJECT') && key !== 'YOUR_PUBLIC_ANON_KEY' ? createClient(url,key) : null;

