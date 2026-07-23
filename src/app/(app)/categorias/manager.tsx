"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import {
  criarCategoria,
  renomearCategoria,
  definirCentroDeCusto,
  arquivarCategoria,
  apagarCategoria,
} from "./actions";
import { Button, Card, Input, Select, cn } from "@/components/ui";

type Filho = {
  id: string;
  nome: string;
  costCenterId: string | null;
  costCenterNome: string | null;
  arquivada: boolean;
  padrao: boolean;
  usos: number;
};

type Grupo = Filho & { filhos: Filho[] };
type Centro = { id: string; nome: string };

export function GerenciadorDeCategorias({
  titulo,
  tipo,
  grupos,
  centros,
}: {
  titulo: string;
  tipo: "income" | "expense";
  grupos: Grupo[];
  centros: Centro[];
}) {
  const router = useRouter();
  const [criandoGrupo, setCriandoGrupo] = useState(false);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);

  const total = grupos.reduce((s, g) => s + 1 + g.filhos.length, 0);
  const acento = tipo === "expense" ? "text-expense" : "text-income";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className={cn("text-sm font-semibold", acento)}>{titulo}</h2>
          <span className="text-xs text-muted-foreground">{total}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCriandoGrupo((v) => !v)}
        >
          <Plus className="size-3.5" />
          Novo grupo
        </Button>
      </div>

      {erroGlobal && (
        <div
          role="alert"
          className="rounded-lg border border-expense/25 bg-expense-subtle px-3 py-2 text-xs text-expense"
        >
          {erroGlobal}
        </div>
      )}

      {criandoGrupo && (
        <FormNovo
          rotulo={`Novo grupo de ${tipo === "expense" ? "despesa" : "receita"}`}
          centros={centros}
          onCancelar={() => setCriandoGrupo(false)}
          onSalvar={async (nome, ccId) => {
            const r = await criarCategoria({
              name: nome,
              type: tipo,
              parentId: null,
              costCenterId: ccId,
            });
            if (r.ok) {
              setCriandoGrupo(false);
              router.refresh();
            }
            return r;
          }}
        />
      )}

      <div className="space-y-2">
        {grupos.map((g) => (
          <GrupoCard
            key={g.id}
            grupo={g}
            tipo={tipo}
            centros={centros}
            onErro={setErroGlobal}
          />
        ))}
      </div>
    </section>
  );
}

function GrupoCard({
  grupo,
  tipo,
  centros,
  onErro,
}: {
  grupo: Grupo;
  tipo: "income" | "expense";
  centros: Centro[];
  onErro: (e: string | null) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [criandoFilho, setCriandoFilho] = useState(false);

  return (
    <Card className={cn("overflow-hidden", grupo.arquivada && "opacity-60")}>
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={`${aberto ? "Recolher" : "Expandir"} ${grupo.nome}`}
          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", aberto && "rotate-180")}
          />
        </button>

        {editando ? (
          <FormRenomear
            valor={grupo.nome}
            onCancelar={() => setEditando(false)}
            onSalvar={async (nome) => {
              const r = await renomearCategoria({ id: grupo.id, name: nome });
              if (r.ok) {
                setEditando(false);
                router.refresh();
              } else onErro(r.erro);
              return r;
            }}
          />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {grupo.nome}
                {grupo.arquivada && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (arquivada)
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {grupo.filhos.length}{" "}
                {grupo.filhos.length === 1 ? "subcategoria" : "subcategorias"}
                {grupo.costCenterNome && ` · ${grupo.costCenterNome}`}
              </p>
            </div>

            <Acoes
              item={grupo}
              onRenomear={() => setEditando(true)}
              onErro={onErro}
            />
          </>
        )}
      </div>

      {aberto && (
        <div className="border-t border-border bg-surface-muted/40 p-3">
          {/*
            O centro de custo mora no grupo: mudar aqui arrasta as
            subcategorias junto, que é como o plano padrão já vem montado.
          */}
          <div className="mb-3 flex items-center gap-2">
            <label
              htmlFor={`cc-${grupo.id}`}
              className="shrink-0 text-xs text-muted-foreground"
            >
              Centro de custo
            </label>
            <SeletorCentro
              id={`cc-${grupo.id}`}
              valor={grupo.costCenterId}
              centros={centros}
              onMudar={async (v) => {
                const r = await definirCentroDeCusto(grupo.id, v);
                if (r.ok) router.refresh();
                else onErro(r.erro);
              }}
            />
          </div>

          <div className="space-y-1">
            {grupo.filhos.map((f) => (
              <FilhoRow key={f.id} filho={f} onErro={onErro} />
            ))}

            {grupo.filhos.length === 0 && !criandoFilho && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Nenhuma subcategoria.
              </p>
            )}
          </div>

          {criandoFilho ? (
            <div className="mt-2">
              <FormNovo
                rotulo={`Nova subcategoria em ${grupo.nome}`}
                centros={[]}
                onCancelar={() => setCriandoFilho(false)}
                onSalvar={async (nome) => {
                  const r = await criarCategoria({
                    name: nome,
                    type: tipo,
                    parentId: grupo.id,
                    costCenterId: null,
                  });
                  if (r.ok) {
                    setCriandoFilho(false);
                    router.refresh();
                  }
                  return r;
                }}
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setCriandoFilho(true)}
            >
              <Plus className="size-3.5" />
              Adicionar subcategoria
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function FilhoRow({
  filho,
  onErro,
}: {
  filho: Filho;
  onErro: (e: string | null) => void;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <div className="rounded-lg bg-surface p-2">
        <FormRenomear
          valor={filho.nome}
          onCancelar={() => setEditando(false)}
          onSalvar={async (nome) => {
            const r = await renomearCategoria({ id: filho.id, name: nome });
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface",
        filho.arquivada && "opacity-60",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm">
        {filho.nome}
        {filho.arquivada && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            (arquivada)
          </span>
        )}
      </span>
      {filho.usos > 0 && (
        <span className="tabular shrink-0 text-[11px] text-muted-foreground">
          {filho.usos}
        </span>
      )}
      <Acoes item={filho} onRenomear={() => setEditando(true)} onErro={onErro} />
    </div>
  );
}

function Acoes({
  item,
  onRenomear,
  onErro,
}: {
  item: Filho;
  onRenomear: () => void;
  onErro: (e: string | null) => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  // Categoria já usada não pode ser apagada — o histórico depende dela.
  // Nesses casos só resta arquivar, e a interface diz isso pelo título.
  const podeApagar = item.usos === 0;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        rotulo={`Renomear ${item.nome}`}
        onClick={onRenomear}
        disabled={pendente}
      >
        <Pencil className="size-3.5" />
      </IconButton>

      <IconButton
        rotulo={
          item.arquivada ? `Reativar ${item.nome}` : `Arquivar ${item.nome}`
        }
        onClick={() =>
          iniciar(async () => {
            onErro(null);
            const r = await arquivarCategoria(item.id, !item.arquivada);
            if (r.ok) router.refresh();
            else onErro(r.erro);
          })
        }
        disabled={pendente}
      >
        {item.arquivada ? (
          <ArchiveRestore className="size-3.5" />
        ) : (
          <Archive className="size-3.5" />
        )}
      </IconButton>

      <IconButton
        rotulo={
          podeApagar
            ? `Apagar ${item.nome}`
            : `${item.nome} tem lançamentos — arquive em vez de apagar`
        }
        perigo
        disabled={pendente || !podeApagar}
        onClick={() => {
          if (!confirm(`Apagar "${item.nome}" definitivamente?`)) return;
          iniciar(async () => {
            onErro(null);
            const r = await apagarCategoria(item.id);
            if (r.ok) router.refresh();
            else onErro(r.erro);
          });
        }}
      >
        <Trash2 className="size-3.5" />
      </IconButton>
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
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors",
        "disabled:opacity-30",
        perigo
          ? "hover:bg-expense-subtle hover:text-expense"
          : "hover:bg-surface-muted hover:text-foreground",
        disabled && "hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SeletorCentro({
  id,
  valor,
  centros,
  onMudar,
}: {
  id: string;
  valor: string | null;
  centros: Centro[];
  onMudar: (v: string | null) => void;
}) {
  const [pendente, iniciar] = useTransition();

  return (
    <Select
      id={id}
      className="h-8 text-xs"
      value={valor ?? ""}
      disabled={pendente}
      onChange={(e) => {
        const novo = e.target.value || null;
        iniciar(async () => {
          await onMudar(novo);
        });
      }}
    >
      <option value="">Sem centro de custo</option>
      {centros.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </Select>
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
        aria-label="Novo nome"
      />
      <IconButton rotulo="Confirmar" onClick={salvar} disabled={pendente}>
        <Check className="size-3.5" />
      </IconButton>
      <IconButton rotulo="Cancelar" onClick={onCancelar}>
        <X className="size-3.5" />
      </IconButton>
      {erro && (
        <span className="text-xs text-expense" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

function FormNovo({
  rotulo,
  centros,
  onSalvar,
  onCancelar,
}: {
  rotulo: string;
  centros: Centro[];
  onSalvar: (
    nome: string,
    ccId: string | null,
  ) => Promise<{ ok: boolean; erro?: string }>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [ccId, setCcId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvar() {
    if (!nome.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await onSalvar(nome.trim(), ccId || null);
      if (!r.ok) setErro(r.erro ?? "Não foi possível criar.");
      else setNome("");
    });
  }

  return (
    <Card className="space-y-2 border-primary-border bg-primary-subtle/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary-text">{rotulo}</p>
        <IconButton rotulo="Cancelar" onClick={onCancelar}>
          <X className="size-3.5" />
        </IconButton>
      </div>

      <Input
        autoFocus
        placeholder="Nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") onCancelar();
        }}
        className="h-9"
        invalid={!!erro}
        aria-label={rotulo}
      />

      {centros.length > 0 && (
        <Select
          className="h-9 text-sm"
          value={ccId}
          onChange={(e) => setCcId(e.target.value)}
          aria-label="Centro de custo do novo grupo"
        >
          <option value="">Sem centro de custo</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      )}

      {erro && (
        <p className="text-xs text-expense" role="alert">
          {erro}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={salvar}
          disabled={pendente || !nome.trim()}
        >
          {pendente ? "Criando…" : "Criar"}
        </Button>
      </div>
    </Card>
  );
}
