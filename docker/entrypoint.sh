#!/bin/sh
set -e

echo "[entrypoint] Aguardando PostgreSQL..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -q; do
  echo "[entrypoint] PostgreSQL indisponível, tentando em 2s..."
  sleep 2
done

echo "[entrypoint] Executando migrations..."
node ./node_modules/.bin/typeorm -d dist/database/data-source.prod.js migration:run

echo "[entrypoint] Iniciando aplicação..."
exec node dist/main
