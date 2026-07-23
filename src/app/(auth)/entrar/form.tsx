"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type FormState } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signIn, {});

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="E-mail" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            required
            // `key` força o React a recriar o campo com o valor devolvido pela
            // ação, em vez de manter o campo já limpo pelo reset automático.
            key={state.values?.email ?? ""}
            defaultValue={state.values?.email ?? ""}
            invalid={!!state.fieldErrors?.email}
          />
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          error={state.fieldErrors?.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            invalid={!!state.fieldErrors?.password}
          />
        </Field>

        <SubmitButton />
      </form>
    </Card>
  );
}
