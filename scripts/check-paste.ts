/** Rodar: npx tsx scripts/check-paste.ts */
import { parseTSV, parseDataFlexivel, casarCategoria } from "../src/lib/paste";

let f = 0;
function check(label: string, atual: unknown, esperado: unknown) {
  const ok = JSON.stringify(atual) === JSON.stringify(esperado);
  if (!ok) f++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${label}` +
      (ok ? "" : `\n        esperado ${JSON.stringify(esperado)}\n        obtido   ${JSON.stringify(atual)}`),
  );
}

console.log("\n--- parseTSV ---");
check(
  "linhas e colunas do Excel",
  parseTSV("10/07/2026\tMercado\t150,00\n11/07/2026\tUber\t30,00"),
  [["10/07/2026", "Mercado", "150,00"], ["11/07/2026", "Uber", "30,00"]],
);
check("lida com \\r\\n do Windows", parseTSV("a\tb\r\nc\td"), [["a", "b"], ["c", "d"]]);
check("quebra final não vira linha vazia", parseTSV("a\tb\n"), [["a", "b"]]);
check("uma célula só", parseTSV("Mercado"), [["Mercado"]]);

console.log("\n--- parseDataFlexivel ---");
check("DD/MM/AAAA", parseDataFlexivel("31/07/2026"), "2026-07-31");
check("D/M/AAAA (um dígito)", parseDataFlexivel("5/3/2026"), "2026-03-05");
check("ano de 2 dígitos", parseDataFlexivel("31/07/26"), "2026-07-31");
check("DD-MM-AAAA", parseDataFlexivel("31-07-2026"), "2026-07-31");
check("já em ISO", parseDataFlexivel("2026-07-31"), "2026-07-31");
check("espaços em volta", parseDataFlexivel("  10/07/2026  "), "2026-07-10");
check("data inválida (dia 32)", parseDataFlexivel("32/07/2026"), null);
check("data inválida (mês 13)", parseDataFlexivel("10/13/2026"), null);
check("29/02 em ano não bissexto", parseDataFlexivel("29/02/2026"), null);
check("29/02 em bissexto", parseDataFlexivel("29/02/2028"), "2028-02-29");
check("texto qualquer", parseDataFlexivel("amanhã"), null);
check("vazio", parseDataFlexivel(""), null);

console.log("\n--- casarCategoria ---");
const cats = [
  { id: "sup", label: "Alimentação › Supermercado" },
  { id: "uber", label: "Transporte › Aplicativos de transporte" },
  { id: "agua", label: "Moradia › Água" },
];
check("pelo nome final", casarCategoria("Supermercado", cats), "sup");
check("pelo caminho completo", casarCategoria("Alimentação › Supermercado", cats), "sup");
check("ignora acento e caixa (agua -> Água)", casarCategoria("AGUA", cats), "agua");
check("sem correspondência", casarCategoria("Criptomoedas", cats), null);
check("vazio", casarCategoria("", cats), null);

console.log(f === 0 ? "\nTudo passou.\n" : `\n${f} falharam.\n`);
process.exit(f === 0 ? 0 : 1);
