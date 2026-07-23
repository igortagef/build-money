import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * Um app que guarda a vida financeira de alguém precisa fechar as portas mais
 * óbvias do navegador: roubo por iframe (clickjacking), vazamento de URL pelo
 * referrer, sniffing de tipo e injeção de script.
 *
 * Sobre a CSP: o Next injeta estilos e scripts inline no runtime, então
 * 'unsafe-inline' é inevitável sem nonce. 'unsafe-eval' fica só em
 * desenvolvimento (o refresh rápido usa eval); em produção ele sai.
 */
const ehDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${ehDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  // Sem back-end de terceiros: nada de chamada para fora.
  `connect-src 'self'${ehDev ? " ws: wss:" : ""}`,
  // Ninguém embute o app num iframe — trava clickjacking.
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Reforça o frame-ancestors para navegadores antigos.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A URL pode conter ids; não vaza para sites externos.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // O app não usa câmera, microfone nem geolocalização.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Só HTTPS, por 2 anos, incluindo subdomínios (vale em produção).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
