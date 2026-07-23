import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/auth";
import { validarTokenReset } from "@/lib/password-reset";
import { RedefinirForm } from "./form";

export const metadata = { title: "Redefinir senha · Build Money" };

export default async function RedefinirSenhaPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getAccess()) redirect("/");
  const { token } = await props.searchParams;

  const valido = token ? await validarTokenReset(token) : false;

  if (!valido) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de redefinição é inválido ou já expirou (eles valem por 30 minutos).
          </p>
        </div>
        <Link href="/recuperar-senha" className="font-medium text-primary-text hover:underline">
          Pedir um novo link
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-sm text-muted-foreground">Escolha uma senha nova para sua conta.</p>
      </div>

      <RedefinirForm token={token!} />
    </div>
  );
}
