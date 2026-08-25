# ---------- Stage 1: instalar dependencias de producción ----------
FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build
COPY package.json ./
RUN npm install --omit=dev

# ---------- Stage 2: imagen final, mínima ----------
FROM public.ecr.aws/lambda/nodejs:20

COPY --from=builder /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY src/ ${LAMBDA_TASK_ROOT}/src/
COPY package.json ${LAMBDA_TASK_ROOT}/

CMD [ "src/handler.handler" ]
