import type { CurrencyCode } from "@/db/schema";

/**
 * Dinheiro trafega pelo sistema como centavos inteiros. Nenhum valor
 * monetário deve existir como float em nenhuma camada: toda conversão
 * para número decimal acontece na borda de exibição, aqui.
 */

export const CURRENCIES: Record<
  CurrencyCode,
  { symbol: string; label: string; locale: string }
> = {
  BRL: { symbol: "R$", label: "Real", locale: "pt-BR" },
  USD: { symbol: "US$", label: "Dólar", locale: "en-US" },
  EUR: { symbol: "€", label: "Euro", locale: "de-DE" },
};

/** Converte centavos para string formatada na moeda. */
export function formatMoney(
  cents: number,
  currency: CurrencyCode = "BRL",
  options: { showSymbol?: boolean; showSign?: boolean } = {},
): string {
  const { showSymbol = true, showSign = false } = options;
  const value = cents / 100;

  const formatted = new Intl.NumberFormat("pt-BR", {
    style: showSymbol ? "currency" : "decimal",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (showSign && cents !== 0) {
    return `${cents > 0 ? "+" : "−"} ${formatted}`;
  }
  return cents < 0 ? `− ${formatted}` : formatted;
}

/**
 * Converte a entrada do usuário em centavos.
 * Aceita "1.234,56", "1234.56", "1234,56" e "R$ 1.234,56".
 */
export function parseMoney(input: string): number | null {
  if (!input?.trim()) return null;

  let cleaned = input.replace(/[^\d.,\-]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Ambos presentes: o que vier por último é o separador decimal.
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Só vírgula: decimal se sobram 1-2 dígitos, senão é separador de milhar.
    const decimals = cleaned.length - lastComma - 1;
    cleaned =
      decimals <= 2
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastDot > -1) {
    const decimals = cleaned.length - lastDot - 1;
    if (decimals > 2) cleaned = cleaned.replace(/\./g, "");
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

/**
 * Divide um valor em N partes iguais sem perder centavos: as primeiras
 * partes recebem o resto da divisão, garantindo que a soma bata com o total.
 * Usado em parcelamentos e rateios proporcionais.
 */
export function splitEvenly(totalCents: number, parts: number): number[] {
  if (parts < 1) throw new Error("parts precisa ser >= 1");

  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;

  return Array.from({ length: parts }, (_, i) =>
    sign * (base + (i < remainder ? 1 : 0)),
  );
}

/** Aplica uma taxa de câmbio a um valor em centavos. */
export function convertMoney(cents: number, rate: number): number {
  return Math.round(cents * rate);
}
