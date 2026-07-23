import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { TriangleAlert } from "lucide-react";
import { cadastroAbertoPorConfig } from "@/lib/convites";
import { SignUpForm } from "./form";

export const metadata = { title: "Criar conta · Build Money" };

export default async function CadastrarPage() {
  if (await getAccess()) redirect("/");

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          Seu plano de categorias já vem pronto — e você pode mudar tudo depois.
        </p>
      </div>

      {/* Se o cadastro estiver aberto por configuração, isso PRECISA ser
          visível — é o que impede publicar sem convite por descuido. */}
      {cadastroAbertoPorConfig() && (
        <div className="flex items-start gap-2 rounded-lg border border-expense bg-expense-subtle p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-expense" />
          <p className="text-xs text-expense">
            <strong>Cadastro aberto sem convite.</strong> Isto é para testes
            (<code>CADASTRO_ABERTO=1</code>). Remova essa variável antes de publicar.
          </p>
        </div>
      )}

      <SignUpForm />

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-primary-text hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
