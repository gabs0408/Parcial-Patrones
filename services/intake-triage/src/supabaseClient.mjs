import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getConfig } from "./config.mjs";

let cachedClient = null;

/**
 * Devuelve un cliente de Supabase usando la Service Role Key.
 * Este microservicio corre 100% server-side (Lambda), por eso usa la
 * Service Role Key en vez del anon key: necesita insertar emergencias
 * a nombre de cualquier ciudadano autenticado que llegue vía API Gateway.
 * La Service Role Key JAMÁS debe salir de este backend (nunca al frontend).
 */
export async function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  const { supabaseUrl, supabaseServiceRoleKey } = await getConfig();
  cachedClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
    // Node 20 en Lambda no trae WebSocket nativo (llega en Node 22+).
    // Le damos explícitamente el paquete "ws" como transporte para que
    // el cliente de Realtime pueda inicializarse sin error, aunque este
    // microservicio no use suscripciones Realtime.
    realtime: { transport: ws },
  });
  return cachedClient;
}
