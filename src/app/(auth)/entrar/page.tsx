import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { SignInForm } from "./form";

export const metadata = { title: "Entrar · Build Money" };

export default async function EntrarPage(props: {
  searchParams: Promise<{ redefinida?: string }>;
}) {
  // Quem já está autenticado não tem o que fazer aqui.
  if (await getAccess()) redirect("/");
  const { redefinida } = await props.searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bem-vindo de volta
        </h1>
        <p className="text-sm text-muted-foreground">
          Entre para continuar cuidando das suas finanças.
        </p>
      </div>

      {redefinida && (
        <p className="rounded-lg border border-income-subtle bg-income-subtle p-3 text-center text-sm text-income">
          Senha redefinida. Entre com a nova senha.
        </p>
      )}

      <SignInForm />

      <p className="text-center text-sm">
        <Link href="/recuperar-senha" className="font-medium text-primary-text hover:underline">
          Esqueci minha senha
        </Link>
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastrar"
          className="font-medium text-primary-text hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
