"use client";

import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plan2classe-app/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, MessageSquareText, RotateCcw, Users, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function ResponsesView({ classroomId }: { classroomId: string }) {
  const queryClient = useQueryClient();
  const responses = useQuery(orpc.response.list.queryOptions({ input: { classroomId } }));
  const analytics = useQuery(orpc.analytics.get.queryOptions({ input: { classroomId } }));
  const reset = useMutation({
    ...orpc.response.reset.mutationOptions(),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.response.list.queryKey({ input: { classroomId } }) }),
        queryClient.invalidateQueries({ queryKey: orpc.analytics.get.queryKey({ input: { classroomId } }) }),
        queryClient.invalidateQueries({ queryKey: orpc.classroom.get.queryKey({ input: { id: classroomId } }) }),
      ]);
      toast.success("Réponses réinitialisées");
    },
    onError: (error) => toast.error(error.message),
  });

  if (responses.isLoading || analytics.isLoading) {
    return <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div><Skeleton className="h-80 rounded-xl" /></div>;
  }
  const data = analytics.data;
  const items = responses.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-2 py-4 shadow-none"><CardContent className="px-4"><p className="text-xs text-muted-foreground">Taux de réponse</p><p className="mt-1 text-2xl font-semibold tabular-nums">{Math.round((data?.responseRate ?? 0) * 100)} %</p><Progress className="mt-3" value={(data?.responseRate ?? 0) * 100} /></CardContent></Card>
        <Card className="gap-2 py-4 shadow-none"><CardContent className="flex items-center justify-between px-4"><div><p className="text-xs text-muted-foreground">Réponses</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data?.responseCount ?? 0}<span className="text-sm font-normal text-muted-foreground"> / {data?.participantCount ?? 0}</span></p></div><Users className="size-5 text-muted-foreground" /></CardContent></Card>
        <Card className="gap-2 py-4 shadow-none"><CardContent className="flex items-center justify-between px-4"><div><p className="text-xs text-muted-foreground">Notes libres</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data?.notesCount ?? 0}</p></div><MessageSquareText className="size-5 text-muted-foreground" /></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none"><CardHeader><CardTitle className="text-sm">Places les plus demandées</CardTitle></CardHeader><CardContent className="space-y-3">{(data?.firstChoiceSeats ?? []).slice(0, 8).map((item, index) => <div key={item.seatId} className="grid grid-cols-[24px_1fr_auto] items-center gap-2 text-xs"><span className="text-muted-foreground">{index + 1}</span><div><div className="mb-1 flex justify-between"><span>{item.label}</span><span>{item.count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(8, (item.count / Math.max(1, data?.responseCount ?? 1)) * 100)}%` }} /></div></div><Badge variant="secondary">{item.count}</Badge></div>)}{(data?.firstChoiceSeats ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Pas encore de choix.</p>}</CardContent></Card>
        <Card className="shadow-none"><CardHeader><CardTitle className="text-sm">Paires réciproques</CardTitle></CardHeader><CardContent className="space-y-2">{(data?.mutualPairs ?? []).slice(0, 10).map((pair) => <div key={`${pair.aName}-${pair.bName}-${pair.relation}`} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs"><span>{pair.aName} ↔ {pair.bName}</span><Badge variant="outline">{pair.relation}</Badge></div>)}{(data?.mutualPairs ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun souhait réciproque.</p>}</CardContent></Card>
      </div>

      <Card className="overflow-hidden py-0 shadow-none">
        <CardHeader className="flex-row items-center justify-between border-b px-4 py-4"><div><CardTitle className="text-sm">Détail des réponses</CardTitle><p className="mt-1 text-xs text-muted-foreground">Les modifications conservent la date de première réponse pour la politique d’arrivée.</p></div><Button size="sm" variant="destructive" disabled={items.length === 0 || reset.isPending} onClick={() => { if (window.confirm("Supprimer toutes les réponses et l’historique des plans de cette classe ?")) reset.mutate({ classroomId }); }}><RotateCcw /> Réinitialiser</Button></CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Élève</TableHead><TableHead>Première réponse</TableHead><TableHead>Révision</TableHead><TableHead>Choix n°1</TableHead><TableHead>Voisins</TableHead><TableHead>Priorité</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.length === 0 ? <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Le formulaire n’a reçu aucune réponse.</TableCell></TableRow> : items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.participantName}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.firstSubmittedAt))}</span></TableCell>
                  <TableCell><Badge variant="secondary">v{item.revision}</Badge></TableCell>
                  <TableCell>{item.response.seat_ranking[0] ?? "—"}</TableCell>
                  <TableCell>{item.response.desired_neighbors.length} souhaité{item.response.desired_neighbors.length > 1 ? "s" : ""} · {item.response.avoided_neighbors.length} évité{item.response.avoided_neighbors.length > 1 ? "s" : ""}</TableCell>
                  <TableCell>{item.response.priority_mode}</TableCell>
                  <TableCell className="max-w-56 truncate">{item.response.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {(data?.unanswered ?? []).length > 0 && (
        <Card className="shadow-none"><CardHeader className="flex-row items-center gap-2"><WandSparkles className="size-4" /><CardTitle className="text-sm">Sans réponse, mais toujours placés</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{data?.unanswered.map((participant) => <Badge key={participant.id} variant="outline">{participant.name}</Badge>)}</CardContent></Card>
      )}
    </div>
  );
}
