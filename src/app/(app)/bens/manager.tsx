"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, Check, X } from "lucide-react";
import {
  criarTipoBem,
  renomearTipoBem,
  arquivarTipoBem,
  apagarTipoBem,
} from "./actions";
import { Button, Card, Input, cn } from "@/components/ui";

type Tipo = { id: string; name: string; arquivado: boolean; usos: number };

export function GerenciadorTiposBem({ tipos }: { tipos: Tipo[] }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tipos.filter((t) => !t.arquivado).length} tipos ativos
        </p>
        <Button variant="secondary" size="sm" onClick={() => setCriando((v) => !v)}>
          <Plus className="size-3.5" />
          Novo tipo
        </Button>
      </div>

      {erro && (
        <div role="alert" className="rounded-lg border border-expense/25 bg-expense-subtle px-3 py-2 text-xs text-expense">
          {erro}
        </div>
      )}

      {criando && (
        <FormNovo
          onCancelar={() => setCriando(false)}
          onSalvar={async (nome) => {
            const r = await criarTipoBem(nome);
            if (r.ok) {
              setCriando(false);
              router.refresh();
            }
            return r;
          }}
        />
      )}

      <Card className="divide-y divide-border">
        {tipos.map((t) => (
          <TipoRow key={t.id} tipo={t} onErro={setErro} />
        ))}
        {tipos.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum tipo cadastrado.
          </p>
        )}
      </Card>
    </section>
  );
}

function TipoRow({ tipo, onErro }: { tipo: Tipo; onErro: (e: string | null) => void }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();

  if (editando) {
    return (
      <div className="p-3">
        <FormRenomear
          valor={tipo.name}
          onCancelar={() => setEditando(false)}
          onSalvar={async (nome) => {
            const r = await renomearTipoBem({ id: tipo.id, name: nome });
            if (r.ok) {
              setEditando(false);
              router.refresh();
            } else onErro(r.erro);
            return r;
          }}
        />
      </div>
    );
  }

  const podeApagar = tipo.usos === 0;

  return (
    <div className={cn("flex items-center gap-2 p-3", tipo.arquivado && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {tipo.name}
          {tipo.arquivado && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(arquivado)</span>
          )}
        </p>
        {tipo.usos > 0 && (
          <p className="text-xs text-muted-foreground">
            {tipo.usos} {tipo.usos === 1 ? "bem usa" : "bens usam"} este tipo
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton rotulo={`Renomear ${tipo.name}`} onClick={() => setEditando(true)} disabled={pendente}>
          <Pencil className="size-3.5" />
        </IconButton>
        <IconButton
          rotulo={tipo.arquivado ? `Reativar ${tipo.name}` : `Arquivar ${tipo.name}`}
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              onErro(null);
              const r = await arquivarTipoBem(tipo.id, !tipo.arquivado);
              if (r.ok) router.refresh();
              else onErro(r.erro);
            })
          }
        >
          {tipo.arquivado ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
        </IconButton>
        <IconButton
          rotulo={podeApagar ? `Apagar ${tipo.name}` : `${tipo.name} está em uso — arquive`}
          perigo
          disabled={pendente || !podeApagar}
          onClick={() => {
            if (!confirm(`Apagar "${tipo.name}" definitivamente?`)) return;
            iniciar(async () => {
              onErro(null);
              const r = await apagarTipoBem(tipo.id);
              if (r.ok) router.refresh();
              else onErro(r.erro);
            });
          }}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  children,
  rotulo,
  onClick,
  disabled,
  perigo,
}: {
  children: React.ReactNode;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors disabled:opacity-30",
        perigo ? "hover:bg-expense-subtle hover:text-expense" : "hover:bg-surface-muted hover:text-foreground",
        disabled && "hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FormRenomear({
  valor,
  onSalvar,
  onCancelar,
}: {
  valor: string;
  onSalvar: (nome: string) => Promise<{ ok: boolean; erro?: string }>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(valor);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    if (!nome.trim() || nome === valor) {
      onCancelar();
      return;
    }
    iniciar(async () => {
      const r = await onSalvar(nome.trim());
      if (!r.ok) setErro(r.erro ?? "Não foi possível renomear.");
    });
  }

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <Input
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") onCancelar();
        }}
        className="h-8 text-sm"
        invalid={!!erro}
        aria-label="Novo nome do tipo"
      />
      <IconButton rotulo="Confirmar" onClick={salvar} disabled={pendente}>
        <Check className="size-3.5" />
      </IconButton>
      <IconButton rotulo="Cancelar" onClick={onCancelar}>
        <X className="size-3.5" />
      </IconButton>
      {erro && <span className="text-xs text-expense" role="alert">{erro}</span>}
    </div>
  );
}

function FormNovo({
  onSalvar,
  onCancelar,
}: {
  onSalvar: (nome: string) => Promise<{ ok: boolean; erro?: string }>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    if (!nome.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await onSalvar(nome.trim());
      if (!r.ok) setErro(r.erro ?? "Não foi possível criar.");
      else setNome("");
    });
  }

  return (
    <Card className="space-y-2 border-primary-border bg-primary-subtle/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary-text">Novo tipo de bem</p>
        <IconButton rotulo="Cancelar" onClick={onCancelar}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      <Input
        autoFocus
        placeholder="Ex.: Joias, Terreno, Máquina"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") onCancelar();
        }}
        className="h-9"
        invalid={!!erro}
        aria-label="Nome do novo tipo de bem"
      />
      {erro && <p className="text-xs text-expense" role="alert">{erro}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={salvar} disabled={pendente || !nome.trim()}>
          {pendente ? "Criando…" : "Criar"}
        </Button>
      </div>
    </Card>
  );
}
