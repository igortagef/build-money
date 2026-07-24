#!/usr/bin/env bash
#
# Atualiza o Build Money no VPS: baixa a versão nova, instala, aplica as
# migrações do banco (só adiciona o que falta — não apaga dados), reconstrói e
# reinicia o app. Uso: dentro da pasta do projeto, rode  ./deploy/deploy.sh
#
set -euo pipefail

echo "==> 1/5 Baixando a versão nova do GitHub..."
git pull origin main

echo "==> 2/5 Instalando dependências..."
npm ci --include=dev

echo "==> 3/5 Aplicando migrações do banco (Neon)..."
npx drizzle-kit migrate

echo "==> 4/5 Gerando o build de produção..."
npm run build

echo "==> 5/5 Reiniciando o app (PM2)..."
pm2 restart build-money --update-env

echo "OK: atualização concluída. Os dados dos clientes não foram tocados."
