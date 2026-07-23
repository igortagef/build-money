"use client";

import { useState, useTransition, useEffect } from "react";
import { Plus, X } from "lucide-react";
import {
  criarContaRapida,
  criarCategoriaRapida,
  listarGrupos,
  type ContaCriada,
  type CategoriaCriada,
} from "../quick-actions";
import { Button, Input, Select, cn } from "@/components/ui";
import { CURRENCIES } from "@/lib/money";
import type { CurrencyCode } from "@/db/schema";

/**
 * Painéis de criação rápida, usados de dentro do formulário de lançamento.
 *
 * Eles NÃO são <form>: um <form> dentro de outro é HTML inválido e o
 * navegador descarta o interno, o que quebraria o envio do lançamento. As
 * ações são chamadas direto do clique, dentro de uma transição.
 */

const TIPOS_CONTA = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "cash", label: "Dinheiro em espécie" },
  { value: "investment", label: "Investimentos" },
] as const;

function Painel({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-primary-border bg-primary-subtle/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary-text">{titulo}</p>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Cancelar"
          className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

export function BotaoNovo({
  onClick,
  aberto,
  rotulo,
}: {
  onClick: () => void;
  aberto: boolean;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      aria-expanded={aberto}
      title={rotulo}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border transition-colors",
        aberto
          ? "border-primary bg-primary-subtle text-primary-text"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <Plus className={cn("size-4 transition-transform", aberto && "rotate-45")} />
    </button>
  );
}

export function NovaContaInline({
  aberto,
  onFechar,
  onCriada,
  baseCurrency,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriada: (c: ContaCriada) => void;
  baseCurrency: CurrencyCode;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<string>("checking");
  const [moeda, setMoeda] = useState<CurrencyCode>(baseCurrency);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (!aberto) return null;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await criarContaRapida({ name: nome, type: tipo, currency: moeda });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onCriada(r.item);
      setNome("");
      onFechar();
    });
  }

  return (
    <Painel titulo="Nova conta" onFechar={onFechar}>
      <Input
        autoFocus
        placeholder="Nome da conta"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          // Enter aqui não pode enviar o lançamento — o campo está dentro dele.
          if (e.key === "Enter") {
            e.preventDefault();
            salvar();
          }
        }}
        invalid={!!erro}
        aria-label="Nome da nova conta"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label="Tipo da nova conta"
        >
          {TIPOS_CONTA.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          value={moeda}
          onChange={(e) => setMoeda(e.target.value as CurrencyCode)}
          aria-label="Moeda da nova conta"
        >
          {Object.entries(CURRENCIES).map(([code, c]) => (
            <option key={code} value={code}>
              {c.symbol} · {c.label}
            </option>
          ))}
        </Select>
      </div>

      {erro && (
        <p className="text-xs text-expense" role="alert">
          {erro}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Saldo e dados do cartão você ajusta depois em Contas.
        </p>
        <Button type="button" size="sm" onClick={salvar} disabled={pendente || !nome.trim()}>
          {pendente ? "Criando…" : "Criar conta"}
        </Button>
      </div>
    </Painel>
  );
}

export function NovaCategoriaInline({
  aberto,
  onFechar,
  onCriada,
  tipo,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriada: (c: CategoriaCriada) => void;
  tipo: "income" | "expense";
}) {
  const [nome, setNome] = useState("");
  const [paiId, setPaiId] = useState("");
  const [grupos, setGrupos] = useState<Array<{ id: string; name: string }>>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  /*
   * Busca os grupos ao abrir o painel.
   *
   * Aqui NÃO se mexe em `paiId`: a busca é assíncrona, e zerar a seleção
   * quando ela retorna descartaria silenciosamente o grupo que o usuário já
   * escolheu enquanto a lista carregava — a categoria iria parar em "Sem
   * grupo" sem ninguém perceber. A troca de tipo é tratada remontando o
   * painel (veja a `key` em quem o renderiza), o que já zera o estado.
   */
  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    listarGrupos(tipo).then((g) => {
      if (!cancelado) setGrupos(g);
    });
    return () => {
      cancelado = true;
    };
  }, [aberto, tipo]);

  if (!aberto) return null;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await criarCategoriaRapida({
        name: nome,
        type: tipo,
        parentId: paiId || null,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onCriada(r.item);
      setNome("");
      onFechar();
    });
  }

  return (
    <Painel
      titulo={`Nova categoria de ${tipo === "expense" ? "despesa" : "receita"}`}
      onFechar={onFechar}
    >
      <Input
        autoFocus
        placeholder="Nome da categoria"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            salvar();
          }
        }}
        invalid={!!erro}
        aria-label="Nome da nova categoria"
      />

      <Select
        value={paiId}
        onChange={(e) => setPaiId(e.target.value)}
        aria-label="Grupo da nova categoria"
      >
        <option value="">Sem grupo (categoria principal)</option>
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            Dentro de {g.name}
          </option>
        ))}
      </Select>

      {erro && (
        <p className="text-xs text-expense" role="alert">
          {erro}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={salvar}
          disabled={pendente || !nome.trim()}
        >
          {pendente ? "Criando…" : "Criar categoria"}
        </Button>
      </div>
    </Painel>
  );
}
