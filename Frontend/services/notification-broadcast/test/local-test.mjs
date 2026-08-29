import { handler } from "../src/handler.mjs";

// Cambia este UUID por el "id" de una emergencia real que ya tengas en tu
// tabla `emergencias` (por ejemplo, alguna de las que creaste probando
// los microservicios anteriores).
const EMERGENCIA_ID_DE_PRUEBA = "0b87e450-370b-49dd-a8ed-e43499247bd8";

console.log("\n--- Test 1: notificación SIN webhooks externos (solo registro) ---");
const evento1 = {
  body: JSON.stringify({ emergencia_id: EMERGENCIA_ID_DE_PRUEBA }),
  requestContext: { requestId: "local-test-notif-1" },
};
const resultado1 = await handler(evento1);
console.log("Status:", resultado1.statusCode);
console.log("Body:", resultado1.body);

console.log("\n--- Test 2: notificación CON un webhook externo (httpbin.org, solo hace eco) ---");
const evento2 = {
  body: JSON.stringify({
    emergencia_id: EMERGENCIA_ID_DE_PRUEBA,
    evento: "prueba_manual",
    webhook_urls: ["https://httpbin.org/post"],
  }),
  requestContext: { requestId: "local-test-notif-2" },
};
const resultado2 = await handler(evento2);
console.log("Status:", resultado2.statusCode);
console.log("Body:", resultado2.body);

console.log("\n--- Test 3: webhook que no existe (para ver el manejo de errores) ---");
const evento3 = {
  body: JSON.stringify({
    emergencia_id: EMERGENCIA_ID_DE_PRUEBA,
    webhook_urls: ["https://este-dominio-no-existe-de-verdad-123.com/webhook"],
  }),
  requestContext: { requestId: "local-test-notif-3" },
};
const resultado3 = await handler(evento3);
console.log("Status:", resultado3.statusCode);
console.log("Body:", resultado3.body);
