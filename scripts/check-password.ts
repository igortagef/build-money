/** Rodar: npx tsx scripts/check-password.ts */
import { hashPassword, verifyPassword } from "../src/lib/password";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
}

async function main() {
  const senha = "senha-super-secreta-123";

  const t0 = Date.now();
  const hash = await hashPassword(senha);
  const hashMs = Date.now() - t0;

  console.log("hash:", hash.slice(0, 40) + "…");
  console.log("tempo para gerar:", hashMs, "ms\n");

  check("senha correta é aceita", await verifyPassword(senha, hash), true);
  check("senha errada é rejeitada", await verifyPassword("errada", hash), false);
  check(
    "senha vazia é rejeitada",
    await verifyPassword("", hash),
    false,
  );
  check(
    "diferença de maiúscula é rejeitada",
    await verifyPassword(senha.toUpperCase(), hash),
    false,
  );

  const hash2 = await hashPassword(senha);
  check("mesmo texto gera hashes diferentes (salt)", hash === hash2, false);
  check("ambos os hashes validam", await verifyPassword(senha, hash2), true);

  check(
    "hash corrompido não quebra",
    await verifyPassword(senha, "lixo$que$nao$e$hash"),
    false,
  );
  check("hash vazio não quebra", await verifyPassword(senha, ""), false);

  // Acentos: a normalização evita que a mesma senha digitada em teclados
  // diferentes gere hashes distintos.
  const comAcento = "seNhaÇão123";
  const h3 = await hashPassword(comAcento);
  check("senha com acento valida", await verifyPassword(comAcento, h3), true);
  check(
    "mesma senha em NFD valida (normalização)",
    await verifyPassword(comAcento.normalize("NFD"), h3),
    true,
  );

  if (hashMs < 20) {
    console.log(
      "\nAVISO: hash rápido demais (" + hashMs + "ms) — custo pode estar baixo.",
    );
  }

  console.log(failures === 0 ? "\nTudo passou.\n" : `\n${failures} falharam.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
