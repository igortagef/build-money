"use client";

/**
 * Erro no nível raiz (substitui o layout inteiro). Precisa trazer <html> e
 * <body> próprios. Sem depender de estilos do app, para funcionar mesmo se o
 * erro tiver acontecido cedo demais.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Algo deu errado
          </h1>
          <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
            Tivemos um problema inesperado. Já registramos o ocorrido. Tente novamente.
          </p>
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              borderRadius: "0.5rem",
              border: "none",
              background: "#1b7c77",
              color: "#fff",
              padding: "0.6rem 1.1rem",
              fontWeight: 600,
            }}
          >
            Tentar de novo
          </button>
          {error.digest && (
            <p style={{ color: "#999", fontSize: "0.75rem", marginTop: "1rem" }}>
              Código: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
