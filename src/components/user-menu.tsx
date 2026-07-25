"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogOut, HelpCircle, UserCog } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "./avatar";

export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir menu da conta"
        className="rounded-full transition-opacity hover:opacity-80"
      >
        <Avatar name={name} email={email} className="size-8 text-xs" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 w-56 rounded-card border border-border bg-surface p-1 shadow-lg"
        >
          <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
            <Avatar name={name} email={email} className="size-9 text-sm" />
            <div className="min-w-0">
              {name && <p className="truncate text-sm font-medium">{name}</p>}
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          {/* Também no menu do avatar: no celular a barra inferior está cheia,
              e é por aqui que a ajuda fica ao alcance. */}
          <Link
            href="/conta"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <UserCog className="size-4" />
            Minha conta
          </Link>
          <Link
            href="/como-usar"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <HelpCircle className="size-4" />
            Como usar
          </Link>
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
