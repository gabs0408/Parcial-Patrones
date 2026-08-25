import { handler } from "../src/handler.mjs";

// Cambia "cali" por la ciudad donde ya tengas emergencias de prueba creadas.
const evento = {
  pathParameters: { ciudad: "cali" },
  queryStringParameters: null,
  requestContext: { requestId: "local-test-geo-1" },
};

const resultado = await handler(evento);
console.log("\n--- Resultado ---");
console.log("Status:", resultado.statusCode);
console.log("Body:", JSON.stringify(JSON.parse(resultado.body), null, 2));
