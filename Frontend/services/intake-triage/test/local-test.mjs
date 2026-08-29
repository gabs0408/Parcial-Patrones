import { handler } from "../src/handler.mjs";

const casoEjemplo = {
  body: JSON.stringify({
    tipo: "usar_medica",
    ciudad: "cali",
    ubicacion: { lat: 3.4516, lng: -76.532 },
    descripcion: "Persona atrapada bajo escombros, fuga de gas cercana",
    datos: { personas_atrapadas: 1, riesgo_inminente: ["fuga_gas"] },
    creado_por: null, // pon aquí un UUID real de public.usuarios si quieres probar contra RLS/FK
    idempotency_key: "test-fijo-001",
  }),
  requestContext: { requestId: "local-test-1" },
};

const resultado = await handler(casoEjemplo);
console.log("\n--- Resultado ---");
console.log("Status:", resultado.statusCode);
console.log("Body:", JSON.stringify(JSON.parse(resultado.body), null, 2));
