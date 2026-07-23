/**
 * Remove por completo contas de teste (@teste.local) deixadas por execuções de
 * e2e que falharam no meio. Apaga o financeiro e a própria conta. NÃO toca em
 * contas reais. Rodar: npx tsx --env-file=.env.local scripts/limpar-contas-teste.ts
 */
import { eq, inArray, like } from "drizzle-orm";
import { db } from "../src/db";
import {
  users, ledgers, ledgerMembers, transactions, transactionSplits,
  reimbursables, reimbursableParticipants, bankStatementLines,
} from "../src/db/schema";

async function main() {
  const testes = await db.select({ id: users.id, email: users.email }).from(users).where(like(users.email, "%@teste.local"));
  if (testes.length === 0) {
    console.log("Nenhuma conta @teste.local encontrada.");
    process.exit(0);
  }

  const userIds = testes.map((t) => t.id);
  const meus = await db.select({ id: ledgers.id }).from(ledgers).where(inArray(ledgers.ownerId, userIds));
  const ledgerIds = meus.map((l) => l.id);

  if (ledgerIds.length) {
    const txs = await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.ledgerId, ledgerIds));
    const rchs = await db.select({ id: reimbursables.id }).from(reimbursables).where(inArray(reimbursables.ledgerId, ledgerIds));
    if (txs.length) await db.delete(transactionSplits).where(inArray(transactionSplits.transactionId, txs.map((t) => t.id)));
    if (rchs.length) await db.delete(reimbursableParticipants).where(inArray(reimbursableParticipants.reimbursableId, rchs.map((r) => r.id)));
    await db.delete(bankStatementLines).where(inArray(bankStatementLines.ledgerId, ledgerIds));
    await db.delete(transactions).where(inArray(transactions.ledgerId, ledgerIds));
    await db.delete(reimbursables).where(inArray(reimbursables.ledgerId, ledgerIds));
    await db.delete(ledgers).where(inArray(ledgers.id, ledgerIds));
  }
  // Participações e as próprias contas.
  await db.delete(ledgerMembers).where(inArray(ledgerMembers.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));

  console.log(`Removidas ${testes.length} conta(s) @teste.local e ${ledgerIds.length} espaço(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
