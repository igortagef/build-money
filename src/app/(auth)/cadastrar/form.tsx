"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type FormState } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Criando sua conta…" : "Criar conta"}
    </Button>
  );
}

export function SignUpForm({ exigeConvite = true }: { exigeConvite?: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(signUp, {});

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Nome" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Como devemos te chamar"
            required
            // O React 19 limpa o formulário após a ação; `key` + defaultValue
            // repõem o que o usuário já tinha digitado.
            key={state.values?.name ?? ""}
            defaultValue={state.values?.name ?? ""}
            invalid={!!state.fieldErrors?.name}
          />
        </Field>

        <Field label="E-mail" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            required
            key={state.values?.email ?? ""}
            defaultValue={state.values?.email ?? ""}
            invalid={!!state.fieldErrors?.email}
          />
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          hint="Mínimo de 8 caracteres."
          error={state.fieldErrors?.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={8}
            invalid={!!state.fieldErrors?.password}
          />
        </Field>

        {/* Beta fechado: o acesso é por convite. O primeiro usuário do sistema
            (o dono) é a única exceção — nesse caso o campo nem aparece. */}
        {exigeConvite && (
          <Field
            label="Código do convite"
            htmlFor="convite"
            hint="Você recebeu ao ser convidado. Formato BM-XXXXX-XXXXX."
            error={state.fieldErrors?.convite}
          >
            <Input
              id="convite"
              name="convite"
              placeholder="BM-XXXXX-XXXXX"
              autoCapitalize="characters"
              invalid={!!state.fieldErrors?.convite}
            />
          </Field>
        )}

        <SubmitButton />

        <p className="text-center text-xs text-muted-foreground">
          Ao criar a conta, você concorda com os{" "}
          <Link href="/termos" className="text-primary-text underline">
            Termos de uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="text-primary-text underline">
            Política de privacidade
          </Link>{" "}
          (versão beta).
        </p>
      </form>
    </Card>
  );
}
