import Link from "next/link";
import { cn } from "@/components/ui";

type RelId = "resumo" | "dre" | "fluxo" | "balanco" | "ir";

const ITENS: { id: RelId; label: string; href: string }[] = [
  { id: "resumo", label: "Resumo", href: "/relatorios" },
  { id: "dre", label: "DRE", href: "/relatorios/dre" },
  { id: "fluxo", label: "Fluxo projetado", href: "/relatorios/fluxo" },
  { id: "balanco", label: "Balanço", href: "/relatorios/balanco" },
  { id: "ir", label: "Imposto de Renda", href: "/relatorios/ir" },
];

/**
 * Sub-navegação dos relatórios. Server component: recebe a aba atual por prop
 * (não usa usePathname), preservando o período/regime na querystring quando faz
 * sentido carregá-los adiante.
 */
export function RelatoriosNav({ atual, qs }: { atual: RelId; qs?: string }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-px">
      {ITENS.map((it) => {
        const href = qs ? `${it.href}?${qs}` : it.href;
        return (
          <Link
            key={it.id}
            href={href}
            aria-current={atual === it.id ? "page" : undefined}
            className={cn(
              "rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              atual === it.id
                ? "border-primary text-primary-text"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
