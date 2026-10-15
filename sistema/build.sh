#!/usr/bin/env bash
# Build do Render (roda a cada deploy, a partir de sistema/):
#   1. compila as telas do React em frontend/dist
#   2. instala o Django e junta os estáticos do admin
#   3. aplica as migrations no Supabase
set -o errexit -o pipefail

echo "==> Telas (React)"
cd frontend
npm ci --no-audit --no-fund
npm run build
cd ..

echo "==> Backend (Django)"
cd backend
pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --noinput

echo "==> Migrations"
# O pooler na porta 6543 (modo transaction) não serve para migrations; a 5432 do
# mesmo pooler (modo session) serve. Sem DATABASE_URL_MIGRACAO, tenta a da aplicação.
DATABASE_URL="${DATABASE_URL_MIGRACAO:-$DATABASE_URL}" python manage.py migrate --noinput

echo "==> Pronto"
