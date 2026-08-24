"use client";

import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader } from "@plan2classe-app/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plan2classe-app/ui/components/dialog";
import { Input } from "@plan2classe-app/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@plan2classe-app/ui/components/input-group";
import { Label } from "@plan2classe-app/ui/components/label";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  LoaderCircle,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

type TemplateId = "empty" | "blank";

const templates: ReadonlyArray<{
  id: TemplateId;
  title: string;
  description: string;
  icon: typeof LayoutGrid;
}> = [
  {
    id: "blank",
    title: "Salle standard",
    description: "4 rangées de tables doubles, 32 places prêtes à ajuster.",
    icon: LayoutGrid,
  },
  {
    id: "empty",
    title: "Démarrer de zéro",
    description: "Une salle vide : vous placez vous-même chaque table.",
    icon: PenLine,
  },
];

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_55%)]" />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl border bg-background shadow-sm">
          <LayoutGrid className="size-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Votre première classe commence ici</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Dessinez la salle, importez les élèves, partagez le formulaire puis laissez le moteur
          chercher le plan le plus équitable.
        </p>
        <Button className="mt-6" onClick={onCreate}>
          <Plus /> Créer une classe
        </Button>
      </div>
    </div>
  );
}

function CreateClassDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateId>("blank");
  const create = useMutation({
    ...orpc.classroom.create.mutationOptions(),
    onSuccess: ({ classroom }) => {
      void queryClient.invalidateQueries({ queryKey: orpc.classroom.list.queryKey() });
      onOpenChange(false);
      setName("");
      setDescription("");
      toast.success("Classe créée");
      router.push(`/dashboard/classes/${classroom.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || create.isPending) return;
    create.mutate({ name: name.trim(), description: description.trim(), template });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (create.isPending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Créer une classe</DialogTitle>
            <DialogDescription>
              Vous pourrez tout modifier ensuite : salle, élèves, contraintes et formulaire.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-5">
            <div className="grid gap-2">
              <Label htmlFor="class-name">Nom de la classe</Label>
              <Input
                id="class-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Terminale A — salle 204"
                autoFocus
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="class-description">
                Description <span className="text-muted-foreground">(facultatif)</span>
              </Label>
              <Input
                id="class-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Plan du premier trimestre"
              />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Point de départ</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {templates.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTemplate(option.id)}
                    aria-pressed={template === option.id}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      template === option.id ? "border-foreground bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <option.icon className="mb-3 size-5" aria-hidden="true" />
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {create.isPending ? "Création…" : "Créer la classe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  loading: boolean;
}) {
  return (
    <Card className="gap-2 py-4 shadow-none">
      <CardContent className="flex items-center justify-between px-4">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-12" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          )}
        </div>
        <div className="grid size-9 place-items-center rounded-lg bg-muted">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardOverview({
  initialCreateOpen = false,
}: {
  initialCreateOpen?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [search, setSearch] = useState("");
  const classes = useQuery(orpc.classroom.list.queryOptions());
  const items = classes.data?.items ?? [];

  const participantTotal = items.reduce((sum, item) => sum + item.participantCount, 0);
  const responseTotal = items.reduce((sum, item) => sum + item.responseCount, 0);
  const solvedTotal = items.filter((item) => item.hasSolution).length;

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.name.toLocaleLowerCase("fr").includes(needle) ||
        item.description.toLocaleLowerCase("fr").includes(needle),
    );
  }, [items, search]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3">
            Espace enseignant
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Mes classes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Un espace par groupe, avec son formulaire, ses contraintes et l’historique de ses
            plans.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Nouvelle classe
        </Button>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Élèves"
          value={participantTotal}
          icon={Users}
          loading={classes.isPending}
        />
        <MetricCard
          label="Réponses"
          value={responseTotal}
          icon={CheckCircle2}
          loading={classes.isPending}
        />
        <MetricCard
          label="Plans calculés"
          value={solvedTotal}
          icon={Sparkles}
          loading={classes.isPending}
        />
      </div>

      {items.length > 6 ? (
        <InputGroup className="mt-8 max-w-sm">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une classe…"
            aria-label="Rechercher une classe"
          />
          {search ? (
            <InputGroupAddon align="inline-end">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setSearch("")}
                aria-label="Effacer la recherche"
              >
                <X />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : null}

      <div className="mt-8">
        {classes.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
            Aucune classe ne correspond à « {search} ».
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => {
              const rate =
                item.participantCount === 0
                  ? 0
                  : Math.round((item.responseCount / item.participantCount) * 100);
              const shortSeats = item.seatCount < item.participantCount;
              return (
                <Link
                  key={item.id}
                  href={`/dashboard/classes/${item.id}`}
                  className="group rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="h-full gap-4 py-5 shadow-none transition-all group-hover:-translate-y-0.5 group-hover:border-foreground/30 group-hover:shadow-md">
                    <CardHeader className="flex-row items-start justify-between gap-3 px-5">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold tracking-tight">{item.name}</h2>
                        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                          {item.description || "Aucune description"}
                        </p>
                      </div>
                      <Badge variant={item.published ? "default" : "secondary"} className="shrink-0">
                        {item.published ? "Ouvert" : "Brouillon"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="mt-auto px-5">
                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
                        <div>
                          <p className="text-lg font-semibold tabular-nums">
                            {item.participantCount}
                          </p>
                          <p className="text-[11px] text-muted-foreground">élèves</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold tabular-nums">{item.responseCount}</p>
                          <p className="text-[11px] text-muted-foreground">réponses</p>
                        </div>
                        <div>
                          <p
                            className={cn(
                              "text-lg font-semibold tabular-nums",
                              shortSeats && "text-warning",
                            )}
                          >
                            {item.seatCount}
                          </p>
                          <p className="text-[11px] text-muted-foreground">places</p>
                        </div>
                      </div>

                      {item.participantCount > 0 ? (
                        <div className="mt-4">
                          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Taux de réponse</span>
                            <span className="tabular-nums">{rate} %</span>
                          </div>
                          <Progress value={rate} className="h-1.5" />
                        </div>
                      ) : null}

                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="size-3.5" aria-hidden="true" />
                          {dateFormatter.format(new Date(item.updatedAt))}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          Ouvrir
                          <ArrowRight
                            className="size-3.5 transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <CreateClassDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
