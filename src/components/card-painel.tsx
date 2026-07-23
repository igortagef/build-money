import { Children, isValidElement } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./ui";

/**
 * Grade que se adapta ao que está visível: o número de colunas acompanha a
 * quantidade de blocos, então a linha sempre fecha cheia — e quando o usuário
 * esconde um bloco no editor, os que sobram se esticam sozinhos.
 *
 * Havendo mais blocos do que colunas, o último da fila ocupa as colunas que
 * sobraram, evitando o "buraco" no fim da grade.
 */
export function Grade({
  max = 3,
  children,
  className,
}: {
  max?: number;
  children: React.ReactNode;
  className?: string;
}) {
  // Blocos escondidos chegam como false/null; só contam os que vão à tela.
  const itens = Children.toArray(children).filter((c) => isValidElement(c));
  const n = itens.length;
  if (n === 0) return null;

  const colunas = Math.min(max, n);
  const resto = n % colunas;

  return (
    <div
      className={cn("grade-auto", className)}
      style={{ ["--cols" as string]: `repeat(${colunas}, minmax(0, 1fr))` }}
    >
      {itens.map((item, i) => {
        // O último da fila estica para fechar a linha quando sobra espaço.
        const span = i === n - 1 && resto !== 0 ? colunas - resto + 1 : 1;
        return (
          // `grid` no invólucro faz o card esticar até a altura da linha, do
          // mesmo jeito que a coluna já iguala a largura.
          <div
            key={i}
            className="grid min-w-0"
            style={span > 1 ? { ["--span" as string]: String(span) } : undefined}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}

const BASE_CARD =
  "flex h-full flex-col overflow-hidden rounded-card bg-surface shadow-sm transition-all";

const CABECALHO =
  "card-titulo flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold";

/**
 * Card do painel (estilo da maquete C): faixa de título em teal com o texto
 * CENTRALIZADO e o ícone junto, corpo um tom acima do fundo, sem borda.
 *
 * Com `href`, o CARD INTEIRO vira clicável e sobe levemente no hover; o rodapé
 * vira só pista visual (nunca link dentro de link). Com `acao`, o card responde
 * ao hover e o atalho fica no rodapé — usado quando o conteúdo já tem links
 * próprios dentro.
 */
export function CardPainel({
  titulo,
  Icon,
  acao,
  href,
  children,
  className,
  corpoClassName,
}: {
  titulo: string;
  Icon?: React.ComponentType<{ className?: string }>;
  acao?: { label: string; href: string };
  href?: string;
  children: React.ReactNode;
  className?: string;
  corpoClassName?: string;
}) {
  const cabecalho = (
    <h2 className={CABECALHO}>
      {Icon && <Icon className="size-4 shrink-0" />}
      {titulo}
    </h2>
  );

  // Card inteiro clicável.
  if (href) {
    return (
      <Link href={href} className={cn(BASE_CARD, "group hover:-translate-y-0.5 hover:shadow-md", className)}>
        {cabecalho}
        <div className={cn("flex flex-1 flex-col p-4", corpoClassName)}>
          {children}
          {acao && (
            <div className="mt-auto flex justify-end pt-3">
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-primary-text">
                {acao.label}
                <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          )}
        </div>
      </Link>
    );
  }

  // Card com atalho no rodapé (o conteúdo pode ter seus próprios links).
  return (
    <div className={cn(BASE_CARD, "hover:shadow-md", className)}>
      {cabecalho}
      <div className={cn("flex flex-1 flex-col p-4", corpoClassName)}>
        {children}
        {acao && (
          <div className="mt-auto flex justify-end pt-3">
            <Link
              href={acao.href}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary-text"
            >
              {acao.label}
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
