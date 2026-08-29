import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

let cachedConfig = null;

const SECRET_NAME = process.env.SECRET_NAME || "emergencias/notification-broadcast";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

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
