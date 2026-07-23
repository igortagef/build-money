"use client";

import { useActionState, useState } from "react";
import { FileUp } from "lucide-react";
import { importarExtrato, type ImportState } from "../ofx-actions";
import { Alert, buttonClasses } from "@/components/ui";

/**
 * Sobe o extrato (OFX/CSV) para a área de espera da conciliação. O arquivo é
 * lido no navegador e vai como texto para a ação — nada é criado como
 * lançamento aqui; as linhas ficam pendentes de conciliação.
 */
export function ImportarExtratoForm({ accountId }: { accountId: string }) {
  const [state, action, pendente] = useActionState<ImportState, FormData>(importarExtrato, {});
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");

  // O arquivo é lido AO SELECIONAR e viaja em campo oculto. Assim a ação é
  // chamada direto pelo `action` do form (dentro da transição do React) —
  // chamá-la após um `await` tiraria o `isPending` do lugar.
  const aoEscolher = async (file: File | undefined) => {
    if (!file) {
      setNome("");
      setTexto("");
      return;
    }
    setNome(file.name);
    setTexto(await file.text());
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="texto" value={texto} />
      <input type="hidden" name="nomeArquivo" value={nome} />
      {state.erro && <Alert>{state.erro}</Alert>}
      {state.ok && state.msg && (
        <p role="status" className="text-xs font-medium text-income">
          {state.msg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
          <FileUp className="size-4" />
          Escolher extrato
          <input
            type="file"
            accept=".ofx,.csv,.txt"
            className="hidden"
            onChange={(e) => aoEscolher(e.target.files?.[0])}
          />
        </label>
        {nome && <span className="truncate text-xs text-muted-foreground">{nome}</span>}
        <button type="submit" disabled={pendente || !texto} className={buttonClasses("primary", "sm")}>
          {pendente ? "Importando…" : "Importar para conciliar"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        As linhas ficam aguardando conferência — nenhum lançamento é criado sem você acatar.
      </p>
    </form>
  );
}
