/**
 * Corrige a DATA DE CAIXA (settlementDate) dos lançamentos de cartão de crédito.
 * Lançamentos antigos (importados via conciliação antes da correção) ficaram sem
 * data de caixa, então o regime caixa/competência não os separava. Aqui
 * recalculamos: caixa = vencimento da fatura que contém a compra.
 *
 * Só toca em contas de cartão com fechamento/vencimento configurados, e só grava
 * quando o valor muda. Rodar: npx tsx --env-file=.env.local scripts/corrigir-caixa-cartao.ts
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { accounts, transactions } from "../src/db/schema";
import { calcularDataDeCaixa } from "../src/lib/statement";

async function main() {
  const cartoes = await db.select().from(accounts).where(eq(accounts.type, "credit_card"));
  let totalCorrigido = 0;

  for (const c of cartoes) {
    if (!c.statementClosingDay || !c.paymentDueDay) {
      console.log(`• ${c.name}: sem fechamento/vencimento configurado — pulado.`);
      continue;
    }
    const txs = await db
      .select({ id: transactions.id, date: transactions.date, sd: transactions.settlementDate })
      .from(transactions)
      .where(eq(transactions.accountId, c.id));

    let corrigidos = 0;
    for (const t of txs) {
      const esperado = calcularDataDeCaixa(t.date, c);
      if ((t.sd ?? t.date) !== esperado) {
        await db.update(transactions).set({ settlementDate: esperado }).where(eq(transactions.id, t.id));
        corrigidos++;
      }
    }
    totalCorrigido += corrigidos;
    console.log(`• ${c.name} (fecha ${c.statementClosingDay}, vence ${c.paymentDueDay}): ${corrigidos}/${txs.length} corrigidos.`);
  }

  console.log(`\nConcluído: ${totalCorrigido} lançamento(s) com a data de caixa corrigida.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
