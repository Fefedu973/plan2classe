import { cn } from "@plan2classe-app/ui/lib/utils";
import Link from "next/link";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}
      aria-label="Plan2Classe — accueil"
    >
      <span className="relative grid size-8 grid-cols-2 gap-0.5 rounded-lg bg-foreground p-1.5 shadow-sm transition-transform group-hover:-rotate-2">
        <span className="rounded-[2px] bg-background" />
        <span className="rounded-[2px] bg-background/70" />
        <span className="rounded-[2px] bg-background/70" />
        <span className="rounded-[2px] bg-background" />
      </span>
      {!compact && (
        <span className="text-[15px]">
          Plan<span className="text-muted-foreground">2</span>Classe
        </span>
      )}
    </Link>
  );
}
