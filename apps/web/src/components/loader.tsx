import { LoaderCircle } from "lucide-react";

export default function Loader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      <span role="status">{label}</span>
    </div>
  );
}
