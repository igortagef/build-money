"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./ui";

const OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "dark", label: "Escuro", Icon: Moon },
] as const;

/**
 * Retorna false no servidor e true no cliente, sem `setState` dentro de um
 * efeito — que dispara uma renderização em cascata a cada montagem.
 */
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // O tema escolhido só é conhecido no cliente; marcar o botão ativo antes
  // disso produziria marcação diferente da renderizada no servidor.
  const mounted = useMounted();

  return (
    <div
      className="inline-flex rounded-lg border border-border bg-surface p-0.5"
      role="group"
      aria-label="Tema"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={cn(
              "grid size-7 place-items-center rounded-md transition-colors",
              active
                ? "bg-primary-subtle text-primary-text"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
