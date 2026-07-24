"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { buttonClasses } from "./ui";

/** Carrega o arquivo como <img> para desenhar no canvas. */
function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem inválida"));
    };
    img.src = url;
  });
}

/** Reduz a imagem para caber em `maxDim` px (mantém proporção) e devolve JPEG. */
async function processar(file: File, maxDim: number): Promise<string> {
  const img = await carregarImagem(file);
  const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * Seletor de foto reutilizável: lê a imagem, reduz no navegador e coloca a data
 * URL num input oculto (`name`), que segue no submit do formulário. Só detalhe
 * visual — nada de upload externo.
 */
export function FotoPicker({
  name,
  maxDim = 512,
  label = "Adicionar foto",
}: {
  name: string;
  maxDim?: number;
  label?: string;
}) {
  const [foto, setFoto] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);

  const aoEscolher = async (file: File | undefined) => {
    setErro(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setErro("Escolha uma imagem JPEG, PNG ou WebP.");
      return;
    }
    try {
      setFoto(await processar(file, maxDim));
    } catch {
      setErro("Não consegui ler essa imagem.");
    }
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={foto} />
      {foto ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="Prévia do bem" className="max-h-40 rounded-lg border border-border object-cover" />
          <button
            type="button"
            onClick={() => setFoto("")}
            aria-label="Remover foto"
            className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm hover:text-expense"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
          <Camera className="size-4" />
          {label}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => aoEscolher(e.target.files?.[0])} />
        </label>
      )}
      {erro && <p className="text-xs text-expense">{erro}</p>}
    </div>
  );
}
