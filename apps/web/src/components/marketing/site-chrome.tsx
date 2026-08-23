"use client";

import Link from "next/link";

import { Brand } from "@/components/brand";
import { LinkButton } from "@/components/common/link-button";
import { ModeToggle } from "@/components/mode-toggle";
import { authClient } from "@/lib/auth-client";

const sections = [
  { href: "#fonctionnement", label: "Fonctionnement" },
  { href: "#capacites", label: "Capacités" },
] as const;

export function SiteHeader() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-5 sm:px-8 lg:px-10">
        <Brand />
        <nav className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="transition-colors hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          {isPending ? null : session ? (
            <LinkButton size="sm" href="/dashboard">
              Mon espace
            </LinkButton>
          ) : (
            <>
              <LinkButton
                size="sm"
                variant="ghost"
                className="hidden sm:inline-flex"
                href="/login"
              >
                Se connecter
              </LinkButton>
              <LinkButton size="sm" href="/login?mode=signup">
                Créer un espace
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <Brand />
          <span className="text-xs text-muted-foreground">
            Plans de classe calculés, pas tirés au sort.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link href="/dashboard/algorithm" className="transition-colors hover:text-foreground">
            Comprendre le moteur
          </Link>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Se connecter
          </Link>
          <span>Auto-hébergeable · OR-Tools CP-SAT</span>
        </div>
      </div>
    </footer>
  );
}
