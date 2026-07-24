// Configuração do PM2 (gerenciador de processo) para o Build Money.
// Mantém o app rodando, reinicia se cair e sobe junto com o servidor.
// Uso (na pasta do projeto):  pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "build-money",
      // Roda o servidor de produção do Next.js (next start) na porta 3000.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname + "/..",
      instances: 1,
      autorestart: true,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
