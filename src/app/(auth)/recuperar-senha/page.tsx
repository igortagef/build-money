import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { RecuperarForm } from "./form";

export const metadata = { title: "Recuperar senha · Build Money" };

export default async function RecuperarSenhaPage() {
  if (await getAccess()) redirect("/");

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe seu e-mail e enviaremos um link para você criar uma nova senha.
        </p>
      </div>

      <RecuperarForm />

      <p className="text-center text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/entrar" className="font-medium text-primary-text hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
