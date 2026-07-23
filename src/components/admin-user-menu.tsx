"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "./ui";

/** Menu do avatar no console de admin: identidade + sair. Nada de finanças. */
export function AdminUserMenu({ name, email }: { name: string | null; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials = (name ?? email)
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "grid size-8 place-items-center rounded-full bg-primary-subtle",
          "text-xs font-semibold text-primary-text transition-opacity hover:opacity-80",
        )}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 w-56 rounded-card border border-border bg-surface p-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-text">
              <ShieldCheck className="size-3.5" /> Administrador
            </p>
            {name && <p className="mt-1 truncate text-sm font-medium">{name}</p>}
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
