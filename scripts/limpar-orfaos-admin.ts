/**
 * Apaga os dados financeiros ÓRFÃOS das contas de administrador.
 *
 * Um admin agora é back-office puro (sem finanças). Contas que foram promovidas
 * a admin depois de já terem um espaço deixam esse espaço inacessível. Este
 * script apaga esses espaços (e todo o financeiro dentro), preservando a CONTA
 * de admin em si (só zera o defaultLedgerId).
 *
 * Rodar: npx tsx --env-file=.env.local scripts/limpar-orfaos-admin.ts
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  users, ledgers, ledgerMembers, transactions, transactionSplits,
  reimbursables, reimbursableParticipants, bankStatementLines,
} from "../src/db/schema";

async function main() {
  const admins = await db
    .select({ id: users.id, email: users.email, defaultLedgerId: users.defaultLedgerId })
    .from(users)
    .where(eq(users.isAdmin, true));

  if (admins.length === 0) {
    console.log("Nenhuma conta de admin encontrada. Nada a fazer.");
    process.exit(0);
  }

  let ledgersApagados = 0;
  let txApagadas = 0;

  for (const admin of admins) {
    const meus = await db
      .select({ id: ledgers.id, name: ledgers.name })
      .from(ledgers)
      .where(eq(ledgers.ownerId, admin.id));

    if (meus.length === 0) {
      console.log(`• ${admin.email}: nenhum espaço órfão.`);
      continue;
    }

    const ledgerIds = meus.map((l) => l.id);
    const txs = await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.ledgerId, ledgerIds));
    const rchs = await db.select({ id: reimbursables.id }).from(reimbursables).where(inArray(reimbursables.ledgerId, ledgerIds));

    console.log(
      `• ${admin.email}: apagando ${meus.length} espaço(s) [${meus.map((l) => l.name).join(", ")}] com ${txs.length} lançamento(s).`,
    );

    // Ordem que respeita as FKs RESTRICT (rateio→lançamento, racha→conta, lançamento→conta).
    if (txs.length) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txs.map((t) => t.id)));
    if (rchs.length) await db.delete(reimbursableParticipants).where(inArray(reimbursableParticipants.reimbursableId, rchs.map((r) => r.id)));
    await db.delete(bankStatementLines).where(inArray(bankStatementLines.ledgerId, ledgerIds));
    await db.delete(transactions).where(inArray(transactions.ledgerId, ledgerIds));
    await db.delete(reimbursables).where(inArray(reimbursables.ledgerId, ledgerIds));
    await db.delete(ledgerMembers).where(inArray(ledgerMembers.ledgerId, ledgerIds));
    await db.delete(ledgers).where(inArray(ledgers.id, ledgerIds)); // cascade: contas, categorias, orçamentos, etc.

    // Zera o defaultLedgerId, que agora aponta para o vazio.
    if (admin.defaultLedgerId && ledgerIds.includes(admin.defaultLedgerId)) {
      await db.update(users).set({ defaultLedgerId: null }).where(eq(users.id, admin.id));
    }

    ledgersApagados += meus.length;
    txApagadas += txs.length;
  }

  // Verificação: nenhum admin deve ter espaço restante.
  let restam = 0;
  for (const admin of admins) {
    const r = await db.select({ id: ledgers.id }).from(ledgers).where(eq(ledgers.ownerId, admin.id));
    restam += r.length;
  }

  console.log(`\nConcluído: ${ledgersApagados} espaço(s) e ${txApagadas} lançamento(s) apagados. Espaços de admin restantes: ${restam}.`);
  process.exit(restam === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
