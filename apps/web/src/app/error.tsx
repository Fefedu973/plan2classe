"use client";

import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Button } from "@plan2classe-app/ui/components/button";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";

import { LinkButton } from "@/components/common/link-button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/20 px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Quelque chose a échoué</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          L’écran n’a pas pu s’afficher. Vos données enregistrées ne sont pas affectées.
        </p>

        {error.message ? (
          <Alert variant="destructive" className="mt-6 text-left">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Détail technique</AlertTitle>
            <AlertDescription className="break-words">
              {error.message}
              {error.digest ? (
                <span className="mt-1 block font-mono text-xs opacity-70">
                  Référence {error.digest}
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <LinkButton variant="outline" href="/dashboard">
            <ArrowLeft /> Mes classes
          </LinkButton>
          <Button onClick={reset}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      </div>
    </main>
  );
}
