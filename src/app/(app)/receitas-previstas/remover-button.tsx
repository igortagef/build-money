"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { removerReceitaPrevista } from "./actions";

export function RemoverReceitaButton({ id, descricao }: { id: string; descricao: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendente}
      aria-label={`Remover ${descricao}`}
      title="Remover"
      onClick={() => {
        if (!confirm(`Remover a receita prevista "${descricao}"?`)) return;
        iniciar(async () => {
          const fd = new FormData();
          fd.set("id", id);
          await removerReceitaPrevista(fd);
          router.refresh();
        });
      }}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
