"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { criarRegra, type RegraState } from "./actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Criar regra"}
    </Button>
  );
}

export function RegraForm({ categorias }: { categorias: Array<{ id: string; label: string }> }) {
  const [state, action] = useActionState<RegraState, FormData>(criarRegra, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await action(fd);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      {state.erro && <Alert>{state.erro}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Quando a descrição contém" htmlFor="pattern">
          <Input id="pattern" name="pattern" placeholder="Ex.: iFood, Uber, Posto" required />
        </Field>
        <Field label="Categorizar como" htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="" disabled>
              Escolha a categoria
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Submit />
      </div>
    </form>
  );
}
