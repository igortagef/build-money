import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Ticket,
  Activity,
  UserCheck,
  UserX,
  Clock,
  Sparkles,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getIndicadoresAdmin } from "@/lib/admin-dashboard";
import { contarLicencas } from "@/lib/convites";
import { buttonClasses, Card } from "@/components/ui";

export const metadata = { title: "Painel · Administração" };

export default async function AdminPainelPage() {
  const admin = await requireAdmin();
  const [ind, licencas] = await Promise.all([getIndicadoresAdmin(), contarLicencas()]);
  const disponiveis = licencas.total - licencas.usadas;
  const taxaAtivos = ind.usuarios > 0 ? Math.round((ind.ativos / ind.usuarios) * 100) : 0;

  const cards: { label: string; valor: number | string; hint?: string; Icon: React.ComponentType<{ className?: string }>; tom?: "bom" | "aviso" }[] = [
    { label: "Usuários", valor: ind.usuarios, hint: `${ind.novos30d} novos em 30 dias`, Icon: Users },
    { label: "Ativos (7 dias)", valor: ind.ativos, hint: `${taxaAtivos}% da base`, Icon: UserCheck, tom: "bom" },
    { label: "Ociosos", valor: ind.ociosos, hint: "sem abrir há 7+ dias", Icon: Clock, tom: ind.ociosos > 0 ? "aviso" : undefined },
    { label: "Nunca abriram", valor: ind.nuncaAbriram, Icon: UserX, tom: ind.nuncaAbriram > 0 ? "aviso" : undefined },
    { label: "Desativados", valor: ind.desativados, Icon: UserX },
    { label: "Lançamentos no sistema", valor: ind.lancamentosTotais.toLocaleString("pt-BR"), hint: "só contagem", Icon: Activity },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <LayoutDashboard className="size-6 text-primary-text" />
          Painel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá, {admin.userName ?? "admin"}. Aqui você acompanha o uso do Build Money —
          só indicadores, nunca dados financeiros de ninguém.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, valor, hint, Icon, tom }) => (
          <Card key={label} className="flex items-start gap-3 p-5">
            <span
              className={
                "grid size-9 shrink-0 place-items-center rounded-lg " +
                (tom === "bom"
                  ? "bg-income-subtle text-income"
                  : tom === "aviso"
                    ? "bg-xp-subtle text-warning"
                    : "bg-primary-subtle text-primary-text")
              }
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="tabular text-2xl font-semibold leading-tight">{valor}</p>
              <p className="text-sm font-medium">{label}</p>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
          </Card>
        ))}
      </div>

      {/* Licenças / convites */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary-subtle text-primary-text" aria-hidden>
            <Ticket className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Licenças (convites)</p>
            <p className="text-xs text-muted-foreground">
              {licencas.usadas} em uso · {disponiveis} disponíveis · {licencas.total} emitidas
            </p>
          </div>
        </div>
        <Link href="/admin/convites" className={buttonClasses("secondary", "sm")}>
          Gerenciar convites
        </Link>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/usuarios" className={buttonClasses("primary", "sm")}>
          <Users className="size-4" />
          Ver usuários
        </Link>
        {ind.ociosos + ind.nuncaAbriram > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-xp-subtle px-3 py-1.5 text-xs font-medium text-warning">
            <Sparkles className="size-3.5" />
            {ind.ociosos + ind.nuncaAbriram} pessoa(s) pouco engajada(s) — talvez valha um empurrão.
          </span>
        )}
      </div>
    </div>
  );
}
