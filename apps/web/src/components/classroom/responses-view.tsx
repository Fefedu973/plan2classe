"use client";

import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plan2classe-app/ui/components/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@plan2classe-app/ui/components/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Clock3,
  Inbox,
  MessageSquareText,
  RotateCcw,
  Users,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { orpc } from "@/utils/orpc";

const priorityLabels: Record<string, string> = {
  balanced: "Équilibré",
  seat: "Place",
  neighbors: "Voisinage",
  none: "Aucune",
};

const relationLabels: Record<string, string> = {
  adjacent: "Voisin direct",
  near: "Proche",
  same_table: "Même table",
  same_cluster: "Même îlot",
  hand_conflict: "Collision de main",
};

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: typeof Users;
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-2 py-4 shadow-none">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        {children}
        {hint ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ResponsesView({ classroomId }: { classroomId: string }) {
  const queryClient = useQueryClient();
  const [resetOpen, setResetOpen] = useState(false);
  const responses = useQuery(orpc.response.list.queryOptions({ input: { classroomId } }));
  const analytics = useQuery(orpc.analytics.get.queryOptions({ input: { classroomId } }));
  const reset = useMutation({
    ...orpc.response.reset.mutationOptions(),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.response.list.queryKey({ input: { classroomId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.analytics.get.queryKey({ input: { classroomId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.classroom.get.queryKey({ input: { id: classroomId } }),
        }),
      ]);
      setResetOpen(false);
      toast.success("Réponses réinitialisées");
    },
    onError: (error) => toast.error(error.message),
  });

  if (responses.isLoading || analytics.isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const data = analytics.data;
  const items = responses.data?.items ?? [];
  const responseRate = Math.round((data?.responseRate ?? 0) * 100);
  const maxSeatCount = Math.max(1, ...(data?.firstChoiceSeats ?? []).map((seat) => seat.count));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Taux de réponse" value={`${responseRate} %`} icon={Users}>
          <Progress className="mt-3" value={responseRate} />
        </MetricCard>
        <MetricCard
          label="Réponses reçues"
          value={
            <>
              {data?.responseCount ?? 0}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {data?.participantCount ?? 0}
              </span>
            </>
          }
          icon={Inbox}
          hint="Les élèves sans réponse restent placés avec une satisfaction neutre."
        />
        <MetricCard
          label="Notes libres"
          value={data?.notesCount ?? 0}
          icon={MessageSquareText}
          hint="À lire avant de figer le plan : elles ne sont jamais interprétées par le moteur."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Places les plus demandées</CardTitle>
            <p className="text-xs text-muted-foreground">
              Premier choix de chaque élève ayant répondu.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(data?.firstChoiceSeats ?? []).slice(0, 8).map((item, index) => (
              <div key={item.seatId} className="grid grid-cols-[1.25rem_1fr_2.5rem] items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="min-w-0">
                  <p className="mb-1 truncate text-xs font-medium">{item.label}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground transition-all"
                      style={{ width: `${Math.max(6, (item.count / maxSeatCount) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-right text-xs font-medium tabular-nums">{item.count}</span>
              </div>
            ))}
            {(data?.firstChoiceSeats ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Pas encore de choix de place.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Souhaits réciproques</CardTitle>
            <p className="text-xs text-muted-foreground">
              Deux élèves qui se sont mutuellement choisis : le moteur les satisfait en priorité.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.mutualPairs ?? []).slice(0, 10).map((pair) => (
              <div
                key={`${pair.aName}-${pair.bName}-${pair.relation}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-xs"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="truncate">{pair.aName}</span>
                  <ArrowLeftRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{pair.bName}</span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  {relationLabels[pair.relation] ?? pair.relation}
                </Badge>
              </div>
            ))}
            {(data?.mutualPairs ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun souhait réciproque pour l’instant.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="flex-row items-start justify-between gap-3 border-b px-4 py-4">
          <div className="min-w-0">
            <CardTitle className="text-sm">Détail des réponses</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Une modification par un élève conserve la date de première réponse utilisée par la
              politique d’arrivée.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={items.length === 0 || reset.isPending}
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw /> Réinitialiser
          </Button>
        </CardHeader>
        {items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-muted/30">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-medium">Aucune réponse pour l’instant</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Ouvrez la collecte puis partagez le lien du formulaire depuis l’onglet Formulaire.
              Vous pouvez aussi calculer un plan sans aucune réponse.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Élève</TableHead>
                <TableHead>Première réponse</TableHead>
                <TableHead className="text-center">Révision</TableHead>
                <TableHead>Choix n°1</TableHead>
                <TableHead>Voisinages</TableHead>
                <TableHead>Arbitrage</TableHead>
                <TableHead className="min-w-48">Note libre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.participantName}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(item.firstSubmittedAt))}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.revision > 1 ? "secondary" : "outline"}>
                      v{item.revision}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.response.seat_ranking[0] ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-success">
                        +{item.response.desired_neighbors.length}
                      </span>
                      <span className="text-muted-foreground" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-destructive">
                        −{item.response.avoided_neighbors.length}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {priorityLabels[item.response.priority_mode] ?? item.response.priority_mode}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-56">
                    {item.response.notes ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="block cursor-help truncate text-xs" />}
                        >
                          {item.response.notes}
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72 whitespace-normal">
                          {item.response.notes}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {(data?.unanswered ?? []).length > 0 ? (
        <Card className="shadow-none">
          <CardHeader className="flex-row items-center gap-2">
            <WandSparkles className="size-4" aria-hidden="true" />
            <CardTitle className="text-sm">
              Sans réponse, mais toujours placés ({data?.unanswered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data?.unanswered.map((participant) => (
              <Badge key={participant.id} variant="outline">
                {participant.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Réinitialiser la collecte ?"
        description="Toutes les réponses des élèves et l’historique des plans calculés de cette classe seront supprimés."
        detail={`${items.length} réponse${items.length > 1 ? "s" : ""} ${items.length > 1 ? "seront perdues" : "sera perdue"}. Les élèves devront répondre à nouveau.`}
        confirmLabel="Tout réinitialiser"
        pending={reset.isPending}
        onConfirm={() => reset.mutate({ classroomId })}
      />
    </div>
  );
}
