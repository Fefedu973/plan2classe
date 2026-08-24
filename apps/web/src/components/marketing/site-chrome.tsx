"use client";

import { Button } from "@plan2classe-app/ui/components/button";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { LinkButton } from "@/components/common/link-button";
import { ModeToggle } from "@/components/mode-toggle";
import { authClient } from "@/lib/auth-client";

const sections = [
  { href: "#fonctionnement", label: "Fonctionnement" },
  { href: "#capacites", label: "Capacités" },
] as const;

const GITHUB_URL = "https://github.com/Fefedu973/plan2classe";

/** lucide-react dropped its brand icons, so the mark lives here. */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

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
          <Button
            variant="ghost"
            size="icon"
            aria-label="Code source sur GitHub"
            nativeButton={false}
            render={<a href={GITHUB_URL} target="_blank" rel="noreferrer" />}
          >
            <GithubIcon className="size-4" aria-hidden="true" />
          </Button>
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
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-3.5" aria-hidden="true" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
