# Imagen de dos etapas. Antes era una sola sobre node:22 completo, y por eso
# pesaba 607 MB. Acá los comandos de build y corepack quedan en la etapa de
# deps y al runtime solo viaja lo que la Lambda ejecuta de verdad.

# --- deps: dependencias de produccion --------------------------------------
FROM public.ecr.aws/docker/library/node:22-slim AS deps

WORKDIR /build

# Los manifiestos van primero y solos para que la capa de install se reutilice
# mientras no cambien las dependencias: si no, cada deploy reinstala todo.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# pnpm se niega a arrancar si la version de devEngines no es la que esta activa.
# Como la imagen no trae el pnpm de la maquina, se pisa el campo en vez de
# dejarlo: es la unica parte del paquete que no puede quedar en la imagen.
RUN node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p));delete j.devEngines;fs.writeFileSync(p,JSON.stringify(j,null,2))" \
  && corepack enable && corepack prepare pnpm@11.9.0 --activate \
  && pnpm install --prod --frozen-lockfile

# --- runtime: lo unico que corre en la Lambda -------------------------------
FROM public.ecr.aws/docker/library/node:22-slim AS runtime

# El adapter convierte el listen() de Express en una Function URL. Tiene que
# quedar en /opt/extensions o la Lambda no lo encuentra.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV PORT=8080
ENV READINESS_CHECK_PATH=/health

WORKDIR /var/task

# package.json es obligatorio, no es metadata: tiene "type": "module" y las
# importaciones de dist/ son .js. Sin este archivo el arranque tira
# ERR_MODULE_NOT_FOUND en el primer import.
COPY --from=deps /build/package.json ./package.json
COPY --from=deps /build/node_modules ./node_modules
COPY dist ./dist

CMD ["node", "dist/server.js"]
