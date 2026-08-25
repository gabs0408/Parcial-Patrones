import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getConfig } from "./config.mjs";

let cachedClient = null;

export async function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  const { supabaseUrl, supabaseServiceRoleKey } = await getConfig();
  cachedClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  return cachedClient;
}
