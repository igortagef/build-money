"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { pedirReset, type ResetState } from "../reset-actions";
import { Alert, Button, Field, Input } from "@/components/ui";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Enviando…" : "Enviar link"}
    </Button>
  );
}

export function RecuperarForm() {
  const [state, action] = useActionState<ResetState, FormData>(pedirReset, {});

  return (
    <form action={action} className="space-y-5">
      {state.erro && <Alert>{state.erro}</Alert>}
      {state.ok && state.msg && (
        <p role="status" className="rounded-lg border border-income-subtle bg-income-subtle p-3 text-sm text-income">
          {state.msg}
        </p>
      )}

      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required />
      </Field>

      <Enviar />
    </form>
  );
}
