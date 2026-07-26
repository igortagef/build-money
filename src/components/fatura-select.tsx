"use client";

import { Select } from "@/components/ui";
import { faturasCandidatas } from "@/lib/statement";

const MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmt = (iso: string, f: Intl.DateTimeFormat) => f.format(new Date(`${iso}T12:00:00`));

/**
 * Seletor de fatura para lançamentos em cartão de crédito. Lista o ciclo
 * automático (sugerido) e os vizinhos, para o usuário corrigir quando o banco
 * jogou a compra numa fatura diferente da calculada. O valor é o VENCIMENTO da
 * fatura (settlement_date) — é assim que o app identifica cada fatura.
 */
export function FaturaSelect({
  dataCompra,
  diaFechamento,
  diaVencimento,
  valorInicial,
  name = "faturaVencimento",
  id,
}: {
  dataCompra: string;
  diaFechamento: number;
  diaVencimento: number;
  valorInicial?: string | null;
  name?: string;
  id?: string;
}) {
  const opcoes = faturasCandidatas(dataCompra, diaFechamento, diaVencimento);
  const auto = opcoes.find((o) => o.auto)?.dueDate ?? opcoes[0]?.dueDate ?? "";
  // Ao editar, mantém a fatura já escolhida se ainda for uma opção; senão, e
  // quando a data muda, volta para a sugerida. `key` remonta o select para o
  // novo default valer (select não controlado).
  const preselecionado =
    valorInicial && opcoes.some((o) => o.dueDate === valorInicial) ? valorInicial : auto;

  return (
    <Select key={preselecionado} id={id} name={name} defaultValue={preselecionado}>
      {opcoes.map((o) => (
        <option key={o.dueDate} value={o.dueDate}>
          {fmt(o.dueDate, MES)} — vence {fmt(o.dueDate, DIA)}
          {o.auto ? " · sugerida" : ""}
        </option>
      ))}
    </Select>
  );
}
