"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonClasses } from "@/components/ui";

/**
 * Tela de erro do app: aparece quando algo quebra numa página. O erro já foi
 * registrado pelo servidor (instrumentação); aqui o foco é não deixar a pessoa
 * numa tela branca e oferecer tentar de novo.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-xp-subtle text-warning">
        <AlertTriangle className="size-6" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground">
          Tivemos um problema ao carregar esta tela. Já registramos o ocorrido. Você pode
          tentar de novo.
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={reset} className={buttonClasses("primary", "md")}>
          Tentar de novo
        </button>
        <Link href="/" className={buttonClasses("secondary", "md")}>
          Ir para o início
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground/70">Código: {error.digest}</p>
      )}
    </div>
  );
}
