import { Wand2, Trash2, Tags, Sparkles } from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { getRegras, getCategoriasParaRegra } from "@/lib/category-rules";
import { Card, buttonClasses } from "@/components/ui";
import { RegraForm } from "./form";
import { apagarRegra, aplicarSugestoes } from "./actions";
import { REGRAS_SUGERIDAS } from "@/lib/regras-sugeridas";

export const metadata = { title: "Regras de categoria · Build Money" };

export default async function RegrasPage() {
  const { ledgerId } = await requireAccess();
  const [regras, categorias] = await Promise.all([
    getRegras(ledgerId),
    getCategoriasParaRegra(ledgerId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wand2 className="size-6 text-primary-text" />
          Categorização automática
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie regras de descrição → categoria. Na importação e nos lançamentos, o
          app preenche a categoria sozinho — sem depender de IA.
        </p>
      </div>

      <Card className="p-5">
        <RegraForm categorias={categorias} />
      </Card>

      {/* Sugestões prontas: só termos que significam a mesma coisa para todos. */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Começar com regras prontas</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {REGRAS_SUGERIDAS.length} regras universais — iFood e Rappi → Delivery, Uber →
            Aplicativos de transporte, Enel/CPFL/Cemig → Energia elétrica, Aluguel, IPTU,
            Farmácia, Netflix… Só cria as que ainda não existem.
          </p>
        </div>
        <form action={aplicarSugestoes}>
          <button type="submit" className={buttonClasses("secondary", "sm")}>
            <Sparkles className="size-4" />
            Adicionar sugeridas
          </button>
        </form>
      </Card>

      {regras.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-primary-subtle text-primary-text">
            <Tags className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            Nenhuma regra ainda. Crie a primeira acima — por exemplo, “iFood” →
            Alimentação.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {regras.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  Quando contém{" "}
                  <span className="font-semibold">“{r.pattern}”</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">→ {r.rotulo}</p>
              </div>
              <form action={apagarRegra}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  aria-label={`Apagar regra ${r.pattern}`}
                  title="Apagar"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-expense-subtle hover:text-expense"
                >
                  <Trash2 className="size-4" />
                </button>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
