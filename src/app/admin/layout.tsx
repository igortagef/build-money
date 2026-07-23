import { requireAdmin } from "@/lib/auth";
import { AmbientBackground } from "@/components/ambient-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav } from "@/components/admin-nav";
import { AdminUserMenu } from "@/components/admin-user-menu";

/**
 * Console de administração — sistema à parte do app financeiro. Back-office
 * puro: monitoramento de uso, usuários e convites. Nenhuma tela financeira e
 * nenhum acesso a dados de ninguém. Só contas de admin passam por aqui.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AmbientBackground />
      <AdminNav />

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:justify-end lg:px-6">
          <span className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary-text lg:hidden">
            Administração
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <AdminUserMenu name={admin.userName} email={admin.userEmail} />
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
    </div>
  );
}
