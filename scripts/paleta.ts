/**
 * Converte as cores da marca para OKLCH e mede contraste (WCAG).
 * Rodar: npx tsx scripts/paleta.ts
 */

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Luminância relativa, base do cálculo de contraste da WCAG. */
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function hexToOklch(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return {
    l: +(L * 100).toFixed(1),
    c: +C.toFixed(3),
    h: +H.toFixed(1),
    css: `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`,
  };
}

const TEAL = "#1b7c77";
const GOLD = "#c8a235";
const WHITE = "#ffffff";
const FUNDO_CLARO_HEX = "#f6f5f1";
const FUNDO_ESCURO = "#12181c";

console.log("=== Cores da marca em OKLCH ===\n");
for (const [nome, hex] of [
  ["Teal", TEAL],
  ["Dourado", GOLD],
] as const) {
  const o = hexToOklch(hex);
  console.log(`${nome.padEnd(9)} ${hex}  ->  ${o.css}`);
  console.log(`${"".padEnd(9)} luminosidade ${o.l}% | croma ${o.c} | matiz ${o.h}°\n`);
}

console.log("=== Contraste (WCAG) ===");
console.log("Mínimo: 4.5 para texto normal, 3.0 para texto grande e componentes.\n");

const pares: Array<[string, string, string]> = [
  ["Teal sobre branco", TEAL, WHITE],
  ["Teal sobre fundo claro", TEAL, FUNDO_CLARO_HEX],
  ["Branco sobre teal", WHITE, TEAL],
  ["Dourado sobre branco", GOLD, WHITE],
  ["Dourado sobre fundo claro", GOLD, FUNDO_CLARO_HEX],
  ["Preto sobre dourado", "#000000", GOLD],
  ["Branco sobre dourado", WHITE, GOLD],
  ["Teal sobre fundo escuro", TEAL, FUNDO_ESCURO],
  ["Dourado sobre fundo escuro", GOLD, FUNDO_ESCURO],
];

for (const [label, fg, bg] of pares) {
  const ratio = contrast(fg, bg);
  const nivel =
    ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA grande" : "REPROVA";
  console.log(
    `  ${label.padEnd(28)} ${ratio.toFixed(2).padStart(5)}:1  ${nivel}`,
  );
}

console.log("\n=== Distância de matiz entre marca e semântica ===");
const verde = hexToOklch("#16a34a");
const tealO = hexToOklch(TEAL);
console.log(
  `  Teal da marca: ${tealO.h}°  |  Verde de receita: ${verde.h}°  |  diferença: ${Math.abs(
    tealO.h - verde.h,
  ).toFixed(1)}°`,
);
console.log(
  "  Abaixo de ~40° as cores tendem a ser lidas como a mesma família.",
);
export {};
