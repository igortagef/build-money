import { requireAccess } from "@/lib/auth";
import { CalculadoraJuros } from "./calc";

export const metadata = { title: "Calculadora · Build Money" };

export default async function CalculadoraPage() {
  await requireAccess();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Calculadora de juros compostos
        </h1>
        <p className="text-sm text-muted-foreground">
          Simule o crescimento de um investimento e compare cenários lado a
          lado. Veja quanto do resultado vem do seu bolso e quanto os juros
          constroem sozinhos.
        </p>
      </div>

      <CalculadoraJuros />
    </div>
  );
}
