"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { deleteAccount, type ExcluirContaState } from "../../actions";
import { Alert, buttonClasses } from "@/components/ui";

function Botao({ nome }: { nome: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Excluir a conta "${nome}"? Só é possível se não houver lançamentos.`)) {
          e.preventDefault();
        }
      }}
      className={buttonClasses("danger", "md")}
    >
      <Trash2 className="size-4" />
      {pending ? "Excluindo…" : "Excluir conta"}
    </button>
  );
}

export function ExcluirContaButton({ id, nome }: { id: string; nome: string }) {
  const [state, action] = useActionState<ExcluirContaState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="space-y-3">
      {state.erro && <Alert>{state.erro}</Alert>}
      <input type="hidden" name="id" value={id} />
      <Botao nome={nome} />
    </form>
  );
}
