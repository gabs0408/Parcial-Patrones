import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

// Cache a nivel de módulo: sobrevive entre invocaciones "warm" del mismo
// contenedor Lambda, así solo pagamos la llamada a Secrets Manager en cold start.
let cachedConfig = null;

const SECRET_NAME = process.env.SECRET_NAME || "emergencias/intake-triage";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

/**
 * Obtiene la configuración (URL y Service Role Key de Supabase).
 *
 * - En Lambda (producción): lee desde AWS Secrets Manager.
 * - En local (NODE_ENV=local): lee desde variables de entorno del proceso,
 *   pensadas para venir de un archivo .env.local que NUNCA se commitea
 *   (ver .gitignore). Esto es solo para poder probar el handler con
 *   `npm run test:local` sin necesitar credenciales de AWS en tu máquina.
 */
export async function getConfig() {
  if (cachedConfig) return cachedConfig;

  if (process.env.NODE_ENV === "local") {
    cachedConfig = {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    if (!cachedConfig.supabaseUrl || !cachedConfig.supabaseServiceRoleKey) {
      throw new Error(
        "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno local (.env.local)"
      );
    }
    return cachedConfig;
  }

  const client = new SecretsManagerClient({ region: AWS_REGION });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: SECRET_NAME })
  );

  const secret = JSON.parse(response.SecretString);
  cachedConfig = {
    supabaseUrl: secret.SUPABASE_URL,
    supabaseServiceRoleKey: secret.SUPABASE_SERVICE_ROLE_KEY,
  };
  return cachedConfig;
}
