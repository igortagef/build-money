"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Ticket } from "lucide-react";
import { LogoMark } from "./logo";
import { BetaBadge } from "./beta-badge";
import { cn } from "./ui";

const ITENS = [
  { href: "/admin", label: "Painel", Icon: LayoutDashboard },
  { href: "/admin/usuarios", label: "Usuários", Icon: Users },
  { href: "/admin/convites", label: "Convites", Icon: Ticket },
] as const;

/** Navegação do console de administração. Enxuta: três destinos, sem finanças. */
export function AdminNav() {
  const pathname = usePathname();
  const ativo = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <>
      {/* Trilho lateral (desktop) */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-surface/50 p-3 lg:flex">
        <div className="flex items-center gap-2 px-2 py-3">
          <LogoMark className="size-7" />
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
              Build Money
              <BetaBadge />
            </p>
            <p className="text-[11px] font-medium text-primary-text">Administração</p>
          </div>
        </div>
        {ITENS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              ativo(href)
                ? "bg-primary-subtle text-primary-text"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </aside>

      {/* Barra inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-border bg-background/90 backdrop-blur lg:hidden">
        {ITENS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
              ativo(href) ? "text-primary-text" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
