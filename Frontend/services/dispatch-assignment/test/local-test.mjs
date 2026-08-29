import { handler } from "../src/handler.mjs";

// IMPORTANTE: reemplaza este UUID por el "id" de una emergencia real que
// ya exista en tu tabla `emergencias` con estado 'recibido' (por ejemplo,
// la que creaste probando el microservicio intake-triage), y asegúrate
// de tener al menos un recurso en `recursos` con la MISMA ciudad y
// disponible = true. Sin eso, esta prueba devolverá un error esperado.
const EMERGENCIA_ID_DE_PRUEBA = "2ca23565-51e2-42b6-a592-535a886448a5";

const eventoCrear = {
  body: JSON.stringify({ emergencia_id: EMERGENCIA_ID_DE_PRUEBA }),
  requestContext: {
    requestId: "local-test-dispatch-1",
    http: { method: "POST" },
  },
};

console.log("\n--- Test 1: crear despacho ---");
const resultadoCrear = await handler(eventoCrear);
console.log("Status:", resultadoCrear.statusCode);
console.log("Body:", resultadoCrear.body);

// Si la creación fue exitosa (201), probamos actualizar su estado.
if (resultadoCrear.statusCode === 201) {
  const despacho = JSON.parse(resultadoCrear.body);

  const eventoActualizar = {
    body: JSON.stringify({ estado: "en_camino" }),
    pathParameters: { id: despacho.id },
    requestContext: {
      requestId: "local-test-dispatch-2",
      http: { method: "PATCH" },
    },
  };

  console.log("\n--- Test 2: actualizar estado del despacho ---");
  const resultadoActualizar = await handler(eventoActualizar);
  console.log("Status:", resultadoActualizar.statusCode);
  console.log("Body:", resultadoActualizar.body);
}
