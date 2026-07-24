"use client";

import { useActionState, useEffect, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { atualizarFoto, removerFoto, type FotoState } from "./actions";
import { Avatar } from "@/components/avatar";
import { Alert, buttonClasses } from "@/components/ui";

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

/** Recorta em quadrado (centralizado), reduz para 256px e devolve JPEG data URL. */
async function processar(file: File): Promise<string> {
  const img = await carregarImagem(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  const escala = Math.max(size / img.width, size / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function FotoPerfilForm({
  name,
  email,
  imageUrl,
}: {
  name: string | null;
  email: string;
  imageUrl: string | null;
}) {
  const [state, action, pendente] = useActionState<FotoState, FormData>(atualizarFoto, {});
  const [nova, setNova] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  // Ao salvar com sucesso, tira a pré-visualização (o avatar já mostra a nova
  // foto pela revalidação). rAF para não fazer setState direto no efeito.
  useEffect(() => {
    if (!state.ok) return;
    const id = requestAnimationFrame(() => setNova(null));
    return () => cancelAnimationFrame(id);
  }, [state.ok]);

  const aoEscolher = async (file: File | undefined) => {
    setErroLocal(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setErroLocal("Escolha uma imagem JPEG, PNG ou WebP.");
      return;
    }
    try {
      setNova(await processar(file));
    } catch {
      setErroLocal("Não consegui ler essa imagem. Tente outra.");
    }
  };

  const preview = nova ?? imageUrl;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar name={name} email={email} imageUrl={preview} className="size-16 text-xl" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label className={buttonClasses("secondary", "sm") + " cursor-pointer"}>
              <Camera className="size-4" />
              {imageUrl || nova ? "Trocar foto" : "Escolher foto"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => aoEscolher(e.target.files?.[0])}
              />
            </label>
            {imageUrl && !nova && (
              <form action={removerFoto}>
                <button type="submit" className={buttonClasses("ghost", "sm")}>
                  <Trash2 className="size-4" />
                  Remover
                </button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG ou WebP. A imagem é recortada em quadrado e reduzida automaticamente.
          </p>
        </div>
      </div>

      {(erroLocal || state.erro) && <Alert>{erroLocal ?? state.erro}</Alert>}
      {state.ok && !nova && (
        <p role="status" className="text-xs font-medium text-income">
          Foto atualizada.
        </p>
      )}

      {nova && (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="foto" value={nova} />
          <button type="submit" disabled={pendente} className={buttonClasses("primary", "sm")}>
            {pendente ? "Salvando…" : "Salvar foto"}
          </button>
          <button
            type="button"
            onClick={() => {
              setNova(null);
              setErroLocal(null);
            }}
            className={buttonClasses("ghost", "sm")}
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
