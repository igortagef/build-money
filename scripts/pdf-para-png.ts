/** Converte o PDF da logo em PNGs para inspeção. Rodar: npx tsx scripts/pdf-para-png.ts */
import { pdfToPng } from "pdf-to-png-converter";

async function main() {
  const pages = await pdfToPng("../logo bm.pdf", {
    outputFolder: "scripts/logo-bm",
    viewportScale: 2.0,
  });
  console.log(`${pages.length} pagina(s):`);
  for (const p of pages) console.log(" ", p.path, `${p.width}x${p.height}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
