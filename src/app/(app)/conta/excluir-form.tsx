"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { excluirMinhaConta, type ExcluirState } from "./actions";
import { Alert, Field, Input, buttonClasses } from "@/components/ui";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClasses("danger", "md")}>
      <Trash2 className="size-4" />
      {pending ? "Excluindo…" : "Excluir minha conta"}
    </button>
  );
}

export function ExcluirContaForm() {
  const [state, action] = useActionState<ExcluirState, FormData>(excluirMinhaConta, {});
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={buttonClasses("secondary", "sm")}>
        <Trash2 className="size-4" />
        Quero excluir minha conta
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.erro && <Alert>{state.erro}</Alert>}
      <p className="text-sm text-muted-foreground">
        Confirme com sua senha e digite <strong className="text-foreground">EXCLUIR</strong> para
        apagar tudo. Não há como desfazer.
      </p>
      <Field label="Sua senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Field label='Digite "EXCLUIR"' htmlFor="confirmacao">
        <Input id="confirmacao" name="confirmacao" placeholder="EXCLUIR" autoCapitalize="characters" required />
      </Field>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={buttonClasses("ghost", "md")}>
          Cancelar
        </button>
        <Botao />
      </div>
    </form>
  );
}
