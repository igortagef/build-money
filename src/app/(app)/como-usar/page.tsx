import Link from "next/link";
import {
  ArrowLeftRight,
  Wallet,
  Repeat,
  PiggyBank,
  Target,
  Tags,
  Trophy,
  SplitSquareHorizontal,
  CheckCheck,
  CalendarClock,
  Pencil,
  Filter,
  Plus,
  Sparkles,
} from "lucide-react";
import { requireAccess } from "@/lib/auth";
import { buttonClasses, Card } from "@/components/ui";

export const metadata = { title: "Como usar · Build Money" };

type Passo = {
  Icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
  href?: string;
  hrefLabel?: string;
};

const PRIMEIROS_PASSOS: Passo[] = [
  {
    Icon: Wallet,
    titulo: "1. Cadastre suas contas",
    texto:
      "Comece pelas contas onde o dinheiro está: conta corrente, cartão de crédito, dinheiro em espécie, investimentos. No cartão, informe o dia do fechamento e do vencimento — o app usa isso para saber quando a compra vira dinheiro saindo.",
    href: "/contas/nova",
    hrefLabel: "Cadastrar conta",
  },
  {
    Icon: ArrowLeftRight,
    titulo: "2. Registre um lançamento",
    texto:
      "Toda entrada ou saída de dinheiro é um lançamento. Escolha se é receita ou despesa, o valor, a conta e a categoria. Você pode criar uma conta ou categoria na hora, sem sair da tela, pelo botão + ao lado dos campos.",
    href: "/lancamentos/novo",
    hrefLabel: "Novo lançamento",
  },
  {
    Icon: PiggyBank,
    titulo: "3. Defina um orçamento",
    texto:
      "Escolha quanto pretende gastar por categoria no mês. A barra fica amarela ao chegar perto do limite e vermelha ao passar. O valor se repete nos meses seguintes até você mudar.",
    href: "/orcamento",
    hrefLabel: "Abrir orçamento",
  },
];

const RECURSOS: Passo[] = [
  {
    Icon: SplitSquareHorizontal,
    titulo: "Rateio: um lançamento, várias categorias",
    texto:
      "No mercado você comprou comida e produtos de limpeza no mesmo pagamento? Clique em Ratear e divida o valor entre categorias. O app garante que a soma feche com o total, e há um botão para dividir igualmente ou ajustar a diferença.",
  },
  {
    Icon: Repeat,
    titulo: "Contas fixas: cadastre uma vez",
    texto:
      "Aluguel, internet, salário, plano de saúde. Cadastre a conta fixa e o app provisiona automaticamente os próximos 12 meses como lançamentos previstos. Você confirma quando pagar — ou marca 'confirma sozinha' para débito automático.",
    href: "/contas-fixas",
    hrefLabel: "Contas fixas",
  },
  {
    Icon: CalendarClock,
    titulo: "Previsto x realizado",
    texto:
      "Um lançamento previsto (fundo mais claro, marcado como 'previsto') ainda não aconteceu — ele mostra o que está por vir. Quando o pagamento acontece, você confirma e ele vira realizado. É isso que responde 'quanto vou ter no fim do mês'.",
  },
  {
    Icon: Pencil,
    titulo: "Contas fixas que variam de valor",
    texto:
      "Energia e água mudam todo mês, mas continuam fixas. Cadastre com um valor aproximado; quando a conta chegar, edite a parcela prevista com o valor real e confirme. O vínculo com a conta fixa é preservado.",
  },
  {
    Icon: CheckCheck,
    titulo: "Conciliação: bater com o extrato",
    texto:
      "Ao conferir o extrato do banco, marque cada lançamento como conferido (o botão de check fica dourado). Conciliar todos os lançamentos de uma conta no mês rende conquistas — e te dá a certeza de que o app reflete a realidade.",
  },
  {
    Icon: Tags,
    titulo: "Competência x caixa",
    texto:
      "No painel, alterne entre Competência (quando o gasto aconteceu) e Caixa (quando o dinheiro sai). Uma compra no cartão em julho, paga em agosto, é despesa de julho por competência e saída de agosto por caixa. Sem isso, um mês cheio de parcelas parece ótimo enquanto a fatura cresce.",
  },
  {
    Icon: Target,
    titulo: "Metas: onde você quer chegar",
    texto:
      "Uma reserva de emergência, uma viagem. Defina o valor e a data, e o app calcula quanto guardar por mês. À medida que você aporta, ele projeta se o seu ritmo atual chega lá na data prometida.",
    href: "/metas",
    hrefLabel: "Minhas metas",
  },
  {
    Icon: Filter,
    titulo: "Filtros e busca",
    texto:
      "Na tela de lançamentos, filtre por conta, categoria ou centro de custo — pode combinar vários. Nas listas longas há uma busca que ignora acento e maiúscula. Os filtros ficam no endereço, então você pode salvar nos favoritos.",
  },
  {
    Icon: Plus,
    titulo: "Criar conta ou categoria sem sair da tela",
    texto:
      "Faltou uma categoria bem na hora de lançar? O botão + ao lado dos campos cria na hora, sem descartar o que você já digitou. As categorias você também personaliza por inteiro na tela Categorias: criar, renomear, arquivar.",
    href: "/categorias",
    hrefLabel: "Categorias",
  },
];

export default async function ComoUsarPage() {
  const { userName } = await requireAccess();
  const primeiroNome = userName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Como usar</h1>
        <p className="text-muted-foreground">
          {primeiroNome ? `${primeiroNome}, ` : ""}o Build Money funciona por
          camadas: primeiro suas contas, depois os lançamentos, e o resto
          (orçamento, metas, contas fixas) se apoia neles. Não precisa fazer
          tudo de uma vez.
        </p>
      </div>

      {/* Gamificação em destaque, com o dourado da marca */}
      <Card className="overflow-hidden border-xp-border">
        <div className="flex items-start gap-4 bg-xp-subtle p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-xp text-xp-foreground">
            <Trophy className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-semibold text-xp-text">
              Você ganha pontos por cuidar do seu dinheiro
            </h2>
            <p className="text-sm text-foreground/80">
              Registrar lançamentos, manter a ofensiva de dias seguidos,
              conciliar contas e bater metas rendem XP e conquistas. O que vale
              não é quanto você gasta — é o hábito de acompanhar. Veja seu
              progresso em{" "}
              <Link href="/conquistas" className="font-medium text-xp-text underline">
                Conquistas
              </Link>
              .
            </p>
          </div>
        </div>
      </Card>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Sparkles className="size-4" aria-hidden />
          Comece por aqui
        </h2>
        <div className="space-y-3">
          {PRIMEIROS_PASSOS.map((p) => (
            <PassoCard key={p.titulo} passo={p} destaque />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Todos os recursos
        </h2>
        <div className="space-y-3">
          {RECURSOS.map((p) => (
            <PassoCard key={p.titulo} passo={p} />
          ))}
        </div>
      </section>

      <Card className="p-5 text-center">
        <p className="text-sm text-muted-foreground">
          Ficou com dúvida em algo que não está aqui? O app foi feito para ser
          explorado — nada que você faça apaga seu histórico sem avisar.
        </p>
      </Card>
    </div>
  );
}

function PassoCard({ passo, destaque }: { passo: Passo; destaque?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <span
          className={
            destaque
              ? "grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
              : "grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-text"
          }
          aria-hidden
        >
          <passo.Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="font-semibold">{passo.titulo}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {passo.texto}
          </p>
          {passo.href && (
            <Link
              href={passo.href}
              className={buttonClasses("secondary", "sm", "mt-1")}
            >
              {passo.hrefLabel}
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
