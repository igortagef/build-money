/**
 * Mede a geometria do símbolo RELATIVA AO QUADRADO da logo (não à caixa do
 * recorte), que é o que o viewBox do SVG precisa.
 * Rodar: npx tsx scripts/medir-simbolo.ts
 */
import sharp from "sharp";

async function main() {
  const { data, info } = await sharp("scripts/logo-bm/hi/logo bm_page_1.png")
    .extract({ left: 2020, top: 1912, width: 320, height: 320 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels: ch } = info;
  const px = (x: number, y: number) => (y * w + x) * ch;
  const isTeal = (i: number) =>
    data[i] < 90 && data[i + 1] > 90 && data[i + 1] < 180 && data[i + 2] > 90;
  const isGold = (i: number) =>
    data[i] > 150 && data[i + 1] > 110 && data[i + 2] < 110;
  const isMarca = (i: number) => isTeal(i) || isGold(i);

  // 1. Limites do quadrado (teal + dourado, já que o dourado é recorte dele)
  let top = -1, bottom = -1, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isMarca(px(x, y))) {
        if (top === -1) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  const lado = Math.max(right - left + 1, bottom - top + 1);
  console.log(`Quadrado da logo: ${right - left + 1} x ${bottom - top + 1} px`);
  console.log(`Origem: (${left}, ${top}) | lado usado: ${lado}\n`);

  const pct = (v: number) => +((v / lado) * 100).toFixed(2);

  // 2. Raio dos cantos
  let x0 = w, x1 = 0;
  for (let x = 0; x < w; x++) {
    if (isMarca(px(x, top))) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  const raio = ((x0 - left) + (right - x1)) / 2;
  console.log(`rx = ${pct(raio)}  (viewBox 100)\n`);

  // 3. Barras douradas, relativas ao quadrado
  const linhas: number[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (isGold(px(x, y))) n++;
    linhas.push(n);
  }
  const faixas: Array<[number, number]> = [];
  let ini = -1;
  for (let y = 0; y < h; y++) {
    if (linhas[y] > 0 && ini === -1) ini = y;
    if (linhas[y] === 0 && ini !== -1) { faixas.push([ini, y - 1]); ini = -1; }
  }

  console.log("Barras (percentuais do quadrado, prontos para o viewBox):\n");
  faixas.forEach(([y0, y1], i) => {
    let xa = w, xb = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < w; x++)
        if (isGold(px(x, y))) { if (x < xa) xa = x; if (x > xb) xb = x; }
    const X = pct(xa - left);
    const Y = pct(y0 - top);
    const W = pct(xb - xa + 1);
    const H = pct(y1 - y0 + 1);
    console.log(`  { x: ${X}, y: ${Y}, w: ${W}, h: ${H} },`);
  });
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
