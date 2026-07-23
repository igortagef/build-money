import Link from "next/link";
import { Flame } from "lucide-react";
import { levelProgress } from "@/lib/achievements";
import { cn } from "./ui";

/**
 * Nível, barra de XP e ofensiva no cabeçalho.
 *
 * O dourado é a cor da conquista — decisão da marca ("o dourado marca
 * conquista"), e por isso ele aparece aqui e não nos gráficos financeiros.
 * No tema claro o dourado é PREENCHIMENTO, nunca texto: sobre fundo claro ele
 * dá 2.4:1 de contraste e seria ilegível.
 */
export function ProgressBadge({
  xp,
  ofensiva,
}: {
  xp: number;
  ofensiva: number;
}) {
  const p = levelProgress(xp);

  return (
    <div className="flex items-center gap-3">
      {ofensiva > 0 && (
        <span
          className="flex items-center gap-1 rounded-full bg-xp-subtle px-2 py-1 text-xs font-semibold text-xp-text"
          title={`${ofensiva} ${ofensiva === 1 ? "dia seguido" : "dias seguidos"} usando o app`}
        >
          <Flame className="size-3.5" aria-hidden />
          {ofensiva}
          <span className="sr-only">
            {ofensiva === 1 ? "dia seguido" : "dias seguidos"}
          </span>
        </span>
      )}

      <Link
        href="/conquistas"
        className="group flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-muted"
        title={`Nível ${p.level} · ${p.titulo} — faltam ${p.xpParaProximo} XP para o próximo`}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-xp text-[11px] font-bold text-xp-foreground">
          {p.level}
        </span>

        <span className="hidden sm:block">
          <span className="block text-[11px] font-medium leading-none">
            {p.titulo}
          </span>
          <span
            className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuenow={p.percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso do nível ${p.level}`}
          >
            <span
              className={cn("block h-full rounded-full bg-xp transition-all")}
              style={{ width: `${p.percentual}%` }}
            />
          </span>
        </span>
      </Link>
    </div>
  );
}
