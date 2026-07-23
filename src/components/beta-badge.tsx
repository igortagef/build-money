import { cn } from "./ui";

/**
 * Selo "Beta": deixa claro, em toda a interface, que o produto está em versão
 * de testes. É informativo — não substitui o termo de uso, mas dá o recado a
 * cada tela.
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-brand-gold/40 bg-brand-gold/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-gold",
        className,
      )}
      title="Build Money está em versão beta (testes). Os dados e recursos podem mudar."
    >
      Beta
    </span>
  );
}
