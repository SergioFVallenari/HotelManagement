#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

REGION="us-east-1"
REPO="166493338674.dkr.ecr.us-east-1.amazonaws.com/gestion-hotel-backend"
FUNCTION="gestion-hotel-backend"
URL="https://c4vcczccaxvnboqwwqivbmcsfe0elniz.lambda-url.us-east-1.on.aws"
FRONTEND_BUCKET="hotel-frontend-305424"
FRONTEND_DISTRIBUTION="E2155UKYS18LH3"
FRONTEND_URL="https://d5foovh2z74go.cloudfront.net"

for cmd in docker aws; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta: $cmd"; exit 1; }
done
PNPM="$(command -v pnpm || command -v pnpm.cmd)" || { echo "Falta: pnpm"; exit 1; }

# El paso de deep links lee y escribe la config de la distribucion
# (GetDistributionConfig + UpdateDistribution). Si el usuario de deploy solo
# tiene CreateInvalidation, el script moria alla adelante, con la Lambda ya
# subida y las migraciones aplicadas; conviene abortar antes de tocar nada.
if ! aws cloudfront get-distribution-config --id "$FRONTEND_DISTRIBUTION" \
  --query 'DistributionConfig.DefaultRootObject' --output text >/dev/null 2>&1; then
  echo "Sin permiso cloudfront:GetDistributionConfig sobre $FRONTEND_DISTRIBUTION."
  echo "El deploy necesita GetDistributionConfig + UpdateDistribution (paso de deep links)."
  exit 1
fi

echo "== prisma generate =="
"$PNPM" exec prisma generate

echo "== typecheck =="
"$PNPM" typecheck

echo "== test =="
"$PNPM" test

echo "== build =="
"$PNPM" build

echo "== ecr login =="
# El token de ECR dura 12 h, asi que hay que refrescarlo en cada corrida: sin
# esto el push falla con 403 Forbidden aunque la AWS CLI tenga permisos.
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${REPO%%/*}"

echo "== docker build =="
docker build --provenance=false --sbom=false -t "$REPO:latest" .

echo "== docker push =="
docker push "$REPO:latest"

echo "== update Lambda =="
# --query para no imprimir la config completa: ahí van el secreto de la base,
# el de JWT y los de MercadoPago en claro.
aws lambda update-function-code --function-name "$FUNCTION" --image-uri "$REPO:latest" --region "$REGION" \
  --query 'LastUpdateStatus' --output text
aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION"

echo "== [backend] sync env =="
# .env.production es la fuente de verdad del env de la Lambda. Asi los
# secretos se cambian en un solo lugar y no pueden quedar desfasados entre el
# archivo y lo que corre en produccion (que es como se rompio una vez).
# Ojo: tocar la configuracion de una Lambda la reinicia (arranque en frio). Por
# eso solo lo hacemos si hay algo que cambiar de verdad.
CUR_ENV="$(mktemp)"
MERGED_ENV="$(mktemp)"
CHANGED_LIST="$(mktemp)"
SYNC_JS="$(mktemp)"
trap 'rm -f "$CUR_ENV" "$MERGED_ENV" "$CHANGED_LIST" "$SYNC_JS"' EXIT

# node y el AWS CLI son binarios nativos de Windows y no entienden las rutas
# /tmp de MSYS (las leen como E:\tmp y falla). cygpath se las pasa como
# Windows. En Linux/macOS no esta cygpath y la ruta ya sirve tal cual.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

cat >"$SYNC_JS" <<'NODEJS'
// Fusiona .env.production sobre el env actual de la Lambda.
// .env.production manda, pero solo en las claves que tengan valor: una clave
// en blanco NO borra la que ya esta en la Lambda, asi nadie tumba produccion
// por forgetting de completar una variable.
const fs = require('fs');
const [localFile, currentFile, outFile, changedFile] = process.argv.slice(2);
const SKIP = new Set(['PORT']); // solo lo usa el server local

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[line.slice(0, i).trim().replace(/^export\s+/, '')] = v;
  }
  return out;
}

const local = parseEnv(fs.readFileSync(localFile, 'utf8'));
const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
const merged = { ...current };
const changed = [];

for (const [k, v] of Object.entries(local)) {
  if (SKIP.has(k) || v === '') continue;
  if (merged[k] !== v) {
    merged[k] = v;
    changed.push(k);
  }
}
fs.writeFileSync(outFile, JSON.stringify({ Variables: merged }, null, 2));
fs.writeFileSync(changedFile, changed.join('\n') + (changed.length ? '\n' : ''));
NODEJS

aws lambda get-function-configuration --region "$REGION" --function-name "$FUNCTION" \
  --query 'Environment.Variables' --output json >"$CUR_ENV"
node "$(native_path "$SYNC_JS")" .env.production \
  "$(native_path "$CUR_ENV")" "$(native_path "$MERGED_ENV")" "$(native_path "$CHANGED_LIST")"

if [ -s "$CHANGED_LIST" ]; then
  echo "   cambian estas variables (los valores no se imprimen):"
  sed 's/^/     - /' "$CHANGED_LIST"
  aws lambda update-function-configuration --function-name "$FUNCTION" --region "$REGION" \
    --environment "file://$(native_path "$MERGED_ENV")" --query 'LastUpdateStatus' --output text
  aws lambda wait function-updated-v2 --function-name "$FUNCTION" --region "$REGION"
else
  echo "   sin cambios, no toco la configuracion de la Lambda"
fi
rm -f "$CUR_ENV" "$MERGED_ENV" "$CHANGED_LIST" "$SYNC_JS"
trap - EXIT

echo "== [backend] migrate deploy =="
DB_URL="$(sed -n 's/^DIRECT_URL="\?\([^"]*\)"\?$/\1/p' .env.production | head -n1)"
if [ -z "$DB_URL" ]; then
  echo "No se pudo leer DIRECT_URL de .env.production"
  exit 1
fi

# Supabase es publico (session pooler IPv4), asi que la migracion corre directo
# desde esta maquina: ya no hace falta el tunel SSH por la NAT que se usaba para
# llegar al RDS privado. La CLI de Prisma va por DIRECT_URL, no por DATABASE_URL.
DIRECT_URL="$DB_URL" "$PNPM" exec prisma migrate deploy
echo "Migraciones aplicadas."

echo "== [backend] smoke test =="
if curl -sf "$URL/health" >/dev/null; then
  echo "Backend OK: $URL/health"
else
  echo "Backend subido, pero /health fallo - revisa CloudWatch"
  exit 1
fi

echo "== [frontend] CloudFront deep links =="
# S3 no tiene error document: un deep link (/reserva/<token>, /reservations…)
# llega como 403/404 y CloudFront devuelve el error en vez del index.html, con
# lo que la SPA no arranca. Se mapean esos dos codigos a /index.html con 200.
# Solo se actualiza si falta alguno: cambiar la config reinicia el deployment de
# la distribucion, y esto ya queda aplicado para las corridas siguientes.
CF_DIR="$(mktemp -d)"
CF_JS="$CF_DIR/fix.js"
aws cloudfront get-distribution-config --id "$FRONTEND_DISTRIBUTION" >"$CF_DIR/current.json"
cat >"$CF_JS" <<'NODEJS'
// Asegura las respuestas custom de CloudFront para los deep links de la SPA.
const fs = require('fs');
const dir = process.argv[2];
const raw = JSON.parse(fs.readFileSync(`${dir}/current.json`, 'utf8'));
const config = raw.DistributionConfig;
config.CustomErrorResponses ||= { Quantity: 0, Items: [] };
config.CustomErrorResponses.Items ||= [];
const items = config.CustomErrorResponses.Items;
const payload = (code) => ({
  ErrorCode: code,
  ResponsePagePath: '/index.html',
  ResponseCode: '200',
  ErrorCachingMinTTL: 0,
});
const missing = [403, 404].filter(
  (code) =>
    !items.some(
      (item) =>
        Number(item.ErrorCode) === code &&
        item.ResponseCode === '200' &&
        item.ResponsePagePath === '/index.html',
    ),
);
if (missing.length === 0) {
  console.log('unchanged');
  process.exit(0);
}
for (const code of missing) items.push(payload(code));
config.CustomErrorResponses.Quantity = items.length;
fs.writeFileSync(`${dir}/new.json`, JSON.stringify(config));
fs.writeFileSync(`${dir}/etag.txt`, raw.ETag);
console.log(`missing:${missing.join(',')}`);
NODEJS

CF_RESULT="$(node "$(native_path "$CF_JS")" "$(native_path "$CF_DIR")")"
if [ "$CF_RESULT" = "unchanged" ]; then
  echo "   respuestas custom ya configuradas, no toco la distribucion"
else
  echo "   $CF_RESULT"
  aws cloudfront wait distribution-deployed --id "$FRONTEND_DISTRIBUTION"
  aws cloudfront update-distribution --id "$FRONTEND_DISTRIBUTION" \
    --distribution-config "file://$(native_path "$CF_DIR/new.json")" \
    --if-match "$(cat "$CF_DIR/etag.txt")" --query 'Distribution.Status' --output text
  aws cloudfront wait distribution-deployed --id "$FRONTEND_DISTRIBUTION"
fi
rm -rf "$CF_DIR"

echo "== [frontend] build =="
( cd ../frontend && "$PNPM" build )

echo "== [frontend] sync S3 =="
aws s3 sync ../frontend/dist "s3://$FRONTEND_BUCKET" --delete --region "$REGION" --exclude "index.html" --exclude "privacidad.html" --exclude "eliminacion-de-datos.html" --cache-control "public, max-age=31536000, immutable"
aws s3 cp ../frontend/dist/index.html "s3://$FRONTEND_BUCKET/index.html" --region "$REGION" --cache-control "no-cache"
aws s3 cp ../frontend/dist/privacidad.html "s3://$FRONTEND_BUCKET/privacidad.html" --region "$REGION" --content-type "text/html; charset=utf-8" --cache-control "no-cache"
aws s3 cp ../frontend/dist/eliminacion-de-datos.html "s3://$FRONTEND_BUCKET/eliminacion-de-datos.html" --region "$REGION" --content-type "text/html; charset=utf-8" --cache-control "no-cache"

echo "== [frontend] invalidate CloudFront =="
INVALIDATION_ID="$(aws cloudfront create-invalidation --distribution-id "$FRONTEND_DISTRIBUTION" --paths '/*' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$FRONTEND_DISTRIBUTION" --id "$INVALIDATION_ID"

echo "== [frontend] smoke test =="
if curl -sf "$FRONTEND_URL" | grep -q 'assets/index-'; then
  echo "Frontend OK: $FRONTEND_URL"
else
  echo "Frontend subido, pero no se sirve el bundle - revisa el bucket y CloudFront"
  exit 1
fi

# Un deep link tiene que devolver el index.html (no 403/404), si no la SPA no
# arranca al abrir el link de reserva que se comparte por WhatsApp.
if curl -sf "$FRONTEND_URL/reserva/__deep-link-check__" | grep -q 'assets/index-'; then
  echo "Deep links OK: $FRONTEND_URL/reserva/<token>"
else
  echo "Los deep links no devuelven el index.html - revisa las respuestas custom de CloudFront"
  exit 1
fi
