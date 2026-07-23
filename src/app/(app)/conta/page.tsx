import { Download, ShieldCheck, User, AlertTriangle } from "lucide-react";
import { requireContaAccess } from "@/lib/auth";
import { buttonClasses, Card } from "@/components/ui";
import { ExcluirContaForm } from "./excluir-form";

export const metadata = { title: "Minha conta · Build Money" };

export default async function ContaPage() {
  const { userName, userEmail, deactivated } = await requireContaAccess();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <User className="size-6 text-primary-text" />
          Minha conta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {userName ? `${userName} · ` : ""}
          {userEmail}
        </p>
      </div>

      {/* Portabilidade */}
      <Card className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Download className="size-4 text-primary-text" />
          Exportar meus dados
        </h2>
        <p className="text-sm text-muted-foreground">
          Baixe tudo o que é seu num arquivo — contas, lançamentos, categorias, metas,
          patrimônio e mais. É legível por máquina (JSON) e não contém senhas.
        </p>
        <div>
          <a href="/conta/exportar" className={buttonClasses("secondary", "sm")}>
            <Download className="size-4" />
            Baixar meus dados (JSON)
          </a>
        </div>
      </Card>

      {/* Segurança (ganchos das próximas etapas) — irrelevante se a conta está
          inativa, quando a tela existe só para exportar/excluir os dados. */}
      {!deactivated && (
        <Card className="space-y-2 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-primary-text" />
            Segurança
          </h2>
          <p className="text-sm text-muted-foreground">
            O acesso é protegido por limite de tentativas e recuperação de senha por link
            com expiração. A verificação em duas etapas (2FA) entra em breve.
          </p>
        </Card>
      )}

      {/* Zona de perigo */}
      <Card className="space-y-3 border-expense/40 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-expense">
          <AlertTriangle className="size-4" />
          Excluir conta
        </h2>
        <p className="text-sm text-muted-foreground">
          Apaga sua conta e todos os dados dos espaços que você possui,
          permanentemente. Espaços compartilhados por outras pessoas não são afetados.
        </p>
        <ExcluirContaForm />
      </Card>

      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
        <span>Build Money · versão beta</span>
        <a href="/termos" className="hover:text-foreground hover:underline">
          Termos de uso
        </a>
        <a href="/privacidade" className="hover:text-foreground hover:underline">
          Política de privacidade
        </a>
      </p>
    </div>
  );
}
