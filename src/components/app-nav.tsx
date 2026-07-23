"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  LayoutDashboard,
  Target,
  Wallet,
  Tags,
  Trophy,
  PiggyBank,
  Repeat,
  HelpCircle,
  FileText,
  FileBarChart,
  TrendingUp,
  Scale,
  Calculator,
  Landmark,
  Home,
  Menu,
  X,
  ChevronDown,
  CreditCard,
  Wand2,
  ListChecks,
} from "lucide-react";
import { cn } from "./ui";
import { Logo, LogoMark } from "./logo";
import { BetaBadge } from "./beta-badge";

type Item = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  // Só marca ativo quando a rota é exatamente esta (para itens cujo href é
  // prefixo de outros, como /relatorios diante de /relatorios/dre).
  exact?: boolean;
};
type Grupo = { titulo: string; itens: Item[] };

/**
 * Menu agrupado por finalidade: os 12 destinos ficavam numa lista corrida que
 * cansava a leitura. Os grupos dão âncora — o usuário busca pela intenção
 * ("quero planejar", "quero investir") em vez de varrer nome a nome.
 */
const GRUPOS: Grupo[] = [
  {
    titulo: "Dia a dia",
    itens: [
      { href: "/lancamentos", label: "Lançamentos", Icon: ArrowLeftRight },
      { href: "/cartoes", label: "Cartões", Icon: CreditCard },
      { href: "/conciliacao", label: "Conciliação", Icon: ListChecks },
      { href: "/contas-fixas", label: "Contas fixas", Icon: Repeat },
    ],
  },
  {
    titulo: "Planejamento",
    itens: [
      { href: "/orcamento", label: "Orçamento", Icon: PiggyBank },
      { href: "/metas", label: "Metas", Icon: Target },
    ],
  },
  {
    titulo: "Investir",
    itens: [
      { href: "/patrimonio", label: "Patrimônio", Icon: Landmark },
      { href: "/calculadora", label: "Calculadora", Icon: Calculator },
    ],
  },
  {
    titulo: "Relatórios",
    itens: [
      { href: "/relatorios", label: "Resumo", Icon: FileText, exact: true },
      { href: "/relatorios/dre", label: "DRE", Icon: FileBarChart },
      { href: "/relatorios/fluxo", label: "Fluxo projetado", Icon: TrendingUp },
      { href: "/relatorios/balanco", label: "Balanço", Icon: Scale },
      { href: "/relatorios/ir", label: "Imposto de Renda", Icon: FileBarChart },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/contas", label: "Contas", Icon: Wallet },
      { href: "/categorias", label: "Categorias", Icon: Tags },
      { href: "/regras", label: "Regras de categoria", Icon: Wand2 },
      { href: "/bens", label: "Bens", Icon: Home },
    ],
  },
];

// Barra inferior do celular: só os quatro destinos mais frequentes; o resto
// vive atrás do botão "Menu".
const MOBILE_PRINCIPAIS: Item[] = [
  { href: "/", label: "Painel", Icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançar", Icon: ArrowLeftRight },
  { href: "/patrimonio", label: "Patrimônio", Icon: Landmark },
  { href: "/conquistas", label: "Conquistas", Icon: Trophy },
];

/** Contador de atenção para um item, a partir do href. */
function badgeDe(href: string, atencao?: { lancamentos: number; cartoes: number }) {
  if (!atencao) return 0;
  if (href === "/lancamentos") return atencao.lancamentos;
  if (href === "/cartoes") return atencao.cartoes;
  return 0;
}

/**
 * Rótulo do item: fica sempre montado e sem quebra de linha, então é revelado
 * pelo recorte da barra ao expandir — sem "estourar" durante a animação.
 */
function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

/**
 * Selo de pendência: pílula com o número na barra aberta; um ponto discreto na
 * trilha de ícones (e na barra inferior do celular).
 */
function Badge({ n, ponto = false }: { n: number; ponto?: boolean }) {
  if (n <= 0) return null;
  if (ponto) {
    return (
      <span
        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-expense ring-2 ring-black/20"
        aria-label={`${n} pendente(s)`}
      />
    );
  }
  return (
    <span
      className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-expense px-1.5 text-[11px] font-semibold text-white"
      aria-label={`${n} pendente(s)`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AppNav({
  atencao,
}: {
  atencao?: { lancamentos: number; cartoes: number };
}) {
  const pathname = usePathname();

  // Administração (usuários, convites) vive num console separado (/admin); o
  // app financeiro não tem itens de admin.
  const grupos: Grupo[] = GRUPOS;
  const [drawerAberto, setDrawerAberto] = useState(false);
  // Grupos recolhidos ficam num conjunto; por padrão todos abertos.
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
  // A barra fica como trilha de ícones e só abre (mostrando os rótulos) quando
  // o mouse passa por cima OU um item recebe foco pelo teclado. Aberta, ela
  // sobrepõe o conteúdo (não empurra), então nada reflui na tela.
  const [mouseEmCima, setMouseEmCima] = useState(false);
  const [temFoco, setTemFoco] = useState(false);
  const colapsado = !(mouseEmCima || temFoco);

  const alternarGrupo = (titulo: string) =>
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(titulo)) proximo.delete(titulo);
      else proximo.add(titulo);
      return proximo;
    });

  const isActive = (href: string, exact = false) =>
    href === "/" || exact ? pathname === href : pathname.startsWith(href);

  // Ícone sempre no mesmo lugar (px-3, shrink-0); o rótulo mora num <span> que
  // fica SEMPRE montado, sem quebra de linha, e é apenas RECORTADO quando a barra
  // está estreita. Assim, ao expandir, o texto é revelado suavemente pela largura
  // crescente — nada de rótulo "estourando" ou ícone pulando durante a animação.
  const linkClasses = (href: string, exact = false) =>
    cn(
      "relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium transition-colors",
      isActive(href, exact)
        ? "bg-sidebar-active text-white"
        : "text-sidebar-fg-muted hover:bg-sidebar-hover hover:text-white",
    );

  return (
    <>
      {/* Desktop: a trilha de ícones reserva 4rem no fluxo; o menu de verdade é
          fixo por cima e só expande no hover/foco, sem empurrar o conteúdo. */}
      <div className="hidden w-16 shrink-0 lg:block" aria-hidden />
      <aside
        onMouseEnter={() => setMouseEmCima(true)}
        onMouseLeave={() => setMouseEmCima(false)}
        onFocusCapture={() => setTemFoco(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setTemFoco(false);
        }}
        className={cn(
          "sidebar-teal fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border transition-[width] duration-200 lg:flex",
          colapsado ? "w-16" : "w-60 shadow-2xl",
        )}
      >
        {/* Padding fixo: o símbolo fica parado; o nome "build money" é revelado
            pelo recorte ao expandir (fica sempre montado, sem quebra). */}
        <div className="flex h-16 items-center overflow-hidden px-4">
          <Link href="/" aria-label="Ir para o painel" className="inline-flex items-center overflow-hidden">
            <LogoMark variant="bare" className="size-8 shrink-0" />
            <span className="ml-2.5 whitespace-nowrap text-lg font-semibold lowercase tracking-tight text-white">
              build money
            </span>
            <BetaBadge className="ml-2 shrink-0" />
          </Link>
        </div>

        <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
          <Link
            href="/"
            aria-current={isActive("/") ? "page" : undefined}
            title={colapsado ? "Painel" : undefined}
            className={linkClasses("/")}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <Rotulo>Painel</Rotulo>
          </Link>

          {grupos.map((g) => {
            const recolhido = recolhidos.has(g.titulo);
            return (
              <div key={g.titulo}>
                {/* Título do grupo some na trilha de ícones; um traço separa. */}
                {colapsado ? (
                  <div className="mx-2 mb-1 border-t border-sidebar-border" aria-hidden />
                ) : (
                  <button
                    type="button"
                    onClick={() => alternarGrupo(g.titulo)}
                    aria-expanded={!recolhido}
                    className="mb-1 flex w-full items-center justify-between rounded px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-fg-muted hover:text-white"
                  >
                    {g.titulo}
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", recolhido && "-rotate-90")}
                    />
                  </button>
                )}
                {(colapsado || !recolhido) && (
                  <div className="space-y-1">
                    {g.itens.map(({ href, label, Icon, exact }) => {
                      const n = badgeDe(href, atencao);
                      return (
                        <Link
                          key={href}
                          href={href}
                          aria-current={isActive(href, exact) ? "page" : undefined}
                          title={colapsado ? label : undefined}
                          className={linkClasses(href, exact)}
                        >
                          <Icon className="size-4 shrink-0" />
                          <Rotulo>{label}</Rotulo>
                          <Badge n={n} ponto={colapsado} />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <Link
            href="/conquistas"
            aria-current={isActive("/conquistas") ? "page" : undefined}
            title={colapsado ? "Conquistas" : undefined}
            className={linkClasses("/conquistas")}
          >
            <Trophy className="size-4 shrink-0" />
            <Rotulo>Conquistas</Rotulo>
          </Link>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <Link
            href="/como-usar"
            aria-current={isActive("/como-usar") ? "page" : undefined}
            title={colapsado ? "Como usar" : undefined}
            className={linkClasses("/como-usar")}
          >
            <HelpCircle className="size-4 shrink-0" />
            <Rotulo>Como usar</Rotulo>
          </Link>
        </div>
      </aside>

      {/* Celular: barra inferior + drawer */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        {MOBILE_PRINCIPAIS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              isActive(href) ? "text-primary-text" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
            <Badge n={badgeDe(href, atencao)} ponto />
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setDrawerAberto(true)}
          aria-label="Abrir menu"
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="size-5" />
          Menu
        </button>
      </nav>

      {/* Drawer do celular */}
      {drawerAberto && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerAberto(false)}
            aria-hidden
          />
          <div className="sidebar-teal absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <Link href="/" aria-label="Ir para o painel" onClick={() => setDrawerAberto(false)}>
                <Logo size="sm" tone="onDark" />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerAberto(false)}
                aria-label="Fechar menu"
                className="grid size-8 place-items-center rounded-lg text-sidebar-fg-muted hover:bg-sidebar-hover hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav
              className="no-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-3"
              // Fechar no clique (e não num efeito de rota) evita a
              // renderização em cascata que o lint acusa.
              onClick={() => setDrawerAberto(false)}
            >
              {grupos.map((g) => (
                <div key={g.titulo}>
                  <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-fg-muted">
                    {g.titulo}
                  </p>
                  <div className="space-y-1">
                    {g.itens.map(({ href, label, Icon, exact }) => (
                      <Link key={href} href={href} className={linkClasses(href, exact)}>
                        <Icon className="size-4" />
                        {label}
                        <Badge n={badgeDe(href, atencao)} />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-t border-sidebar-border pt-3">
                <Link href="/como-usar" className={linkClasses("/como-usar")}>
                  <HelpCircle className="size-4" />
                  Como usar
                </Link>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
