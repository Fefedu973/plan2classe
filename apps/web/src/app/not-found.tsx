import { ArrowLeft, Compass } from "lucide-react";

import { LinkButton } from "@/components/common/link-button";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/20 px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-background shadow-sm">
          <Compass className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-6 font-mono text-xs tracking-widest text-muted-foreground">ERREUR 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cette page n’existe pas</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Le lien est peut-être incomplet, ou la classe qu’il désignait a été supprimée.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <LinkButton variant="outline" href="/">
            <ArrowLeft /> Accueil
          </LinkButton>
          <LinkButton href="/dashboard">Mes classes</LinkButton>
        </div>
      </div>
    </main>
  );
}
