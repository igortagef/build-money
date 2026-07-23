"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { redefinirSenha, type ResetState } from "../reset-actions";
import { Alert, Button, Field, Input } from "@/components/ui";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando…" : "Redefinir senha"}
    </Button>
  );
}

export function RedefinirForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(redefinirSenha, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      {state.erro && <Alert>{state.erro}</Alert>}

      <Field label="Nova senha" htmlFor="password" hint="Mínimo de 8 caracteres.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          minLength={8}
        />
      </Field>

      <Salvar />
    </form>
  );
}
