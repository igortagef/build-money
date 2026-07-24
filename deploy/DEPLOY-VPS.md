# Publicar o Build Money no VPS (Hostinger) — guia enxuto

O que **eu já deixei pronto** (você não faz nada disso): o app, o build validado,
o script de deploy (`deploy/deploy.sh`), a config do PM2 (`deploy/ecosystem.config.cjs`)
e a do Nginx (`deploy/nginx-build-money.conf`).

O que **é com você** (precisa do seu GitHub e do seu VPS) está abaixo. É uma vez
só; depois, atualizar é **um comando**.

> Substitua nos comandos: `app.suaempresa.com.br` pelo seu subdomínio e
> `SEU_USUARIO/build-money` pelo seu repositório do GitHub.

---

## Antes de começar, tenha em mãos
- Acesso **SSH** ao VPS (IP, usuário root e senha/chave — no painel da Hostinger).
- Uma conta no **GitHub**.
- O **subdomínio** que vai usar (ex.: `app.suaempresa.com.br`).
- A **connection string do banco de produção** no Neon (recomendo uma *branch*
  nova, separada do banco de teste — veja a nota no fim).

---

## Parte 1 — GitHub (uma vez, na sua máquina)
1. Crie um repositório **privado** no GitHub chamado `build-money` (sem README).
2. No terminal do Claude (aqui), quando você mandar, eu rodo:
   ```
   git remote add origin https://github.com/SEU_USUARIO/build-money.git
   git push -u origin main
   ```
   > A primeira vez pede login do GitHub — isso é seu (eu não digito senha).
   > Depois disso, publicar é só `git push`, que eu faço quando você pedir.

---

## Parte 2 — Preparar o VPS (uma vez, via SSH)
Conecte no VPS (`ssh root@SEU_IP`) e rode:

```bash
# 2.1 Node.js 22 LTS + git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
npm install -g pm2

# 2.2 Baixar o código
mkdir -p /var/www && cd /var/www
git clone https://github.com/SEU_USUARIO/build-money.git
cd build-money

# 2.3 Criar o arquivo de segredos (produção) — veja os valores abaixo
nano .env.local
```

No `nano`, cole (troque pelos seus valores) e salve (Ctrl+O, Enter, Ctrl+X):
```
DATABASE_URL=postgresql://...seu banco de PRODUÇÃO no Neon...
AUTH_SECRET=cole-aqui-um-segredo-forte
APP_URL=https://app.suaempresa.com.br
# E-mail (opcional agora; sem isto, o link de reset cai no log):
RESEND_API_KEY=
EMAIL_FROM="Build Money <nao-responda@suaempresa.com.br>"
```
> Gere o `AUTH_SECRET` com: `openssl rand -base64 32`
> **NÃO** coloque `CADASTRO_ABERTO` — senão o cadastro fica aberto a qualquer um.

```bash
# 2.4 Instalar, migrar o banco, buildar e subir
npm ci --include=dev
npx drizzle-kit migrate
npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # copie e rode a linha que ele imprimir (faz subir no boot)
```

O app agora roda em `http://127.0.0.1:3000` dentro do VPS. Falta expor com domínio + SSL.

---

## Parte 3 — Domínio + HTTPS (uma vez)
```bash
# 3.1 Nginx + certbot
apt-get install -y nginx certbot python3-certbot-nginx

# 3.2 Config do site (o arquivo já está pronto em deploy/)
cp /var/www/build-money/deploy/nginx-build-money.conf /etc/nginx/sites-available/build-money
nano /etc/nginx/sites-available/build-money   # troque o subdomínio (2 lugares)
ln -s /etc/nginx/sites-available/build-money /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**DNS:** no painel onde fica o domínio da AG&F, crie um registro **A**:
`app`  →  o **IP do VPS**. (Espere alguns minutos propagar.)

```bash
# 3.3 SSL automático (cadeado)
certbot --nginx -d app.suaempresa.com.br
```

Pronto: `https://app.suaempresa.com.br` no ar. O **primeiro usuário a se
cadastrar vira o admin** (back-office); os demais entram por convite.

---

## Depois: atualizar quando você pedir (um comando)
Quando eu avisar que tem novidade e você quiser publicar, no VPS:
```bash
cd /var/www/build-money
./deploy/deploy.sh
```
Isso baixa a versão nova, migra o banco (só adiciona o que falta), reconstrói e
reinicia. **Os dados dos clientes não são tocados.**

---

## Nota importante — banco de produção limpo
O banco atual tem dados de teste. Para produção, crie no Neon uma **branch/novo
banco** vazio e use a connection string dele no `.env.local` do VPS. Assim o
beta começa limpo, e o banco de teste continua separado para o nosso trabalho.

## Migrar para a Vercel no futuro (se quiser)
Como os dados ficam no Neon e as fotos no banco (não no disco do VPS), migrar é
só apontar a Vercel para o **mesmo** `DATABASE_URL` e o **mesmo** `AUTH_SECRET`,
e trocar o DNS. Zero perda de dados.
