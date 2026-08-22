"use client";

import { newId } from "@plan2classe-app/api/domain/defaults";
import type { Participant, Room, Rule, RuleKind } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Checkbox } from "@plan2classe-app/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plan2classe-app/ui/components/dialog";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plan2classe-app/ui/components/select";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { AlertTriangle, GripVertical, Plus, Shield, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

const kinds: Array<{ value: RuleKind; label: string; description: string }> = [
  { value: "fixed_seat", label: "Place imposée", description: "Un élève doit occuper une place précise." },
  { value: "forbidden_seats", label: "Places interdites", description: "Un élève ne peut pas occuper certaines places." },
  { value: "no_go" as RuleKind, label: "No-go enrichi", description: "Interdit des places ou des zones à un élève." },
  { value: "require_seat_tags", label: "Zone obligatoire", description: "Le siège doit porter un ou plusieurs tags." },
  { value: "forbid_seat_tags", label: "Zone interdite", description: "Le siège ne doit pas porter certains tags." },
  { value: "pair_relation", label: "Relation entre deux élèves", description: "Impose ou interdit voisinage, proximité ou table." },
  { value: "group_same_table", label: "Groupe ensemble", description: "Maintient un groupe sur la même table." },
  { value: "group_different_tables", label: "Groupe séparé", description: "Place chaque membre sur une table différente." },
  { value: "group_spread_table" as RuleKind, label: "Groupe réparti", description: "Limite le nombre de membres par table." },
  { value: "min_distance", label: "Distance minimale", description: "Éloigne deux élèves d’un seuil donné." },
  { value: "max_distance", label: "Distance maximale", description: "Rapproche deux élèves d’un seuil donné." },
  { value: "max_board_distance" as RuleKind, label: "Distance au tableau", description: "Place un élève assez près du tableau." },
  { value: "tag_not_adjacent", label: "Tags non adjacents", description: "Évite les voisins partageant une valeur de tag." },
  { value: "alternate_tag" as RuleKind, label: "Alternance de tag", description: "Alterner genre, niveau ou tout autre tag." },
  { value: "max_tag_per_table", label: "Quota par table", description: "Limite un profil sur chaque table." },
  { value: "table_tag_balance", label: "Équilibre par table", description: "Équilibre plusieurs valeurs d’un tag." },
];

const relationOptions = [
  ["adjacent", "Voisins directs"],
  ["near", "Proches"],
  ["same_table", "Même table"],
  ["same_cluster", "Même îlot"],
  ["hand_conflict", "Collision de main"],
] as const;

function ruleDefaults(kind: RuleKind): Record<string, unknown> {
  switch (kind) {
    case "fixed_seat": return { participant_id: "", seat_id: "" };
    case "forbidden_seats": return { participant_id: "", seat_ids: [] };
    case "require_seat_tags":
    case "forbid_seat_tags": return { participant_id: "", tags: [], mode: "any" };
    case "pair_relation": return { a: "", b: "", relation: "adjacent", required: true };
    case "group_same_table":
    case "group_different_tables": return { participant_ids: [] };
    case "min_distance":
    case "max_distance": return { a: "", b: "", distance: 200 };
    case "tag_not_adjacent": return { tag_key: "genre", values: [] };
    case "max_tag_per_table": return { tag_key: "groupe", tag_value: "", max_count: 1 };
    case "table_tag_balance": return { tag_key: "genre", values: [], max_difference: 1 };
    case "no_go": return { participant_id: "", seat_ids: [], tags: [], mode: "any" };
    case "group_spread_table": return { participant_ids: [], max_per_table: 1 };
    case "alternate_tag": return { tag: "genre", tag_key: null, values: [], relation: "adjacent" };
    case "max_board_distance": return { participant_id: "", max_distance: 300 };
  }
}

function ParticipantSelect({ value, onChange, participants, placeholder = "Choisir un élève" }: { value: string; onChange: (value: string) => void; participants: Participant[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "")}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{participants.filter((participant) => participant.active).map((participant) => <SelectItem key={participant.id} value={participant.id}>{participant.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function MultiParticipants({ value, onChange, participants }: { value: string[]; onChange: (value: string[]) => void; participants: Participant[] }) {
  return (
    <div className="grid max-h-40 gap-1 overflow-auto rounded-lg border p-2 sm:grid-cols-2">
      {participants.filter((participant) => participant.active).map((participant) => (
        <label key={participant.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
          <Checkbox checked={value.includes(participant.id)} onCheckedChange={(checked) => onChange(checked ? [...value, participant.id] : value.filter((id) => id !== participant.id))} />
          <span className="truncate">{participant.name}</span>
        </label>
      ))}
    </div>
  );
}

function ParamsEditor({ rule, participants, room, onParams }: { rule: Rule; participants: Participant[]; room: Room; onParams: (params: Record<string, unknown>) => void }) {
  const params = rule.params as unknown as Record<string, unknown>;
  const set = (key: string, value: unknown) => onParams({ ...params, [key]: value });
  const participant = (key: string) => <ParticipantSelect value={String(params[key] ?? "")} onChange={(value) => set(key, value)} participants={participants} />;
  const pair = (
    <div className="grid gap-2 sm:grid-cols-2">
      {participant("a")}{participant("b")}
    </div>
  );
  const tags = (key = "tags") => <Input value={Array.isArray(params[key]) ? (params[key] as string[]).join(", ") : ""} onChange={(event) => set(key, event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} placeholder="front, accessible" />;
  const seats = (key = "seat_ids") => (
    <div className="grid max-h-40 grid-cols-3 gap-1 overflow-auto rounded-lg border p-2">
      {room.seats.filter((seat) => seat.enabled).map((seat) => {
        const values = Array.isArray(params[key]) ? (params[key] as string[]) : [];
        return <label key={seat.id} className="flex items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-muted"><Checkbox checked={values.includes(seat.id)} onCheckedChange={(checked) => set(key, checked ? [...values, seat.id] : values.filter((id) => id !== seat.id))} />{seat.label}</label>;
      })}
    </div>
  );

  switch (rule.kind) {
    case "fixed_seat":
      return <div className="grid gap-2 sm:grid-cols-2">{participant("participant_id")}<Select value={String(params.seat_id ?? "")} onValueChange={(value) => set("seat_id", value)}><SelectTrigger className="w-full"><SelectValue placeholder="Choisir une place" /></SelectTrigger><SelectContent>{room.seats.filter((seat) => seat.enabled).map((seat) => <SelectItem key={seat.id} value={seat.id}>{seat.label}</SelectItem>)}</SelectContent></Select></div>;
    case "forbidden_seats":
      return <div className="grid gap-2">{participant("participant_id")}{seats()}</div>;
    case "require_seat_tags":
    case "forbid_seat_tags":
      return <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]">{participant("participant_id")}{tags()}<Select value={String(params.mode ?? "any")} onValueChange={(value) => set("mode", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Au moins un</SelectItem><SelectItem value="all">Tous</SelectItem></SelectContent></Select></div>;
    case "pair_relation":
      return <div className="grid gap-2">{pair}<div className="grid gap-2 sm:grid-cols-2"><Select value={String(params.relation ?? "adjacent")} onValueChange={(value) => set("relation", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{relationOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><label className="flex items-center gap-2 rounded-lg border px-3 text-xs"><Switch checked={Boolean(params.required)} onCheckedChange={(checked) => set("required", checked)} /> Relation requise</label></div></div>;
    case "group_same_table":
    case "group_different_tables":
      return <MultiParticipants value={Array.isArray(params.participant_ids) ? params.participant_ids as string[] : []} onChange={(value) => set("participant_ids", value)} participants={participants} />;
    case "min_distance":
    case "max_distance":
      return <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px]">{participant("a")}{participant("b")}<Input type="number" value={Number(params.distance ?? 200)} onChange={(event) => set("distance", Number(event.target.value))} aria-label="Distance en pixels" /></div>;
    case "tag_not_adjacent":
      return <div className="grid gap-2 sm:grid-cols-2"><Input value={String(params.tag_key ?? "")} onChange={(event) => set("tag_key", event.target.value)} placeholder="Clé du tag" />{tags("values")}</div>;
    case "max_tag_per_table":
      return <div className="grid gap-2 sm:grid-cols-3"><Input value={String(params.tag_key ?? "")} onChange={(event) => set("tag_key", event.target.value)} placeholder="Clé" /><Input value={String(params.tag_value ?? "")} onChange={(event) => set("tag_value", event.target.value)} placeholder="Valeur" /><Input type="number" min="1" value={Number(params.max_count ?? 1)} onChange={(event) => set("max_count", Number(event.target.value))} /></div>;
    case "table_tag_balance":
      return <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px]"><Input value={String(params.tag_key ?? "")} onChange={(event) => set("tag_key", event.target.value)} placeholder="Clé" />{tags("values")}<Input type="number" min="0" value={Number(params.max_difference ?? 1)} onChange={(event) => set("max_difference", Number(event.target.value))} /></div>;
    default:
      if (rule.kind === "no_go") return <div className="grid gap-2">{participant("participant_id")}{seats()}<Label>Tags de sièges interdits</Label>{tags("tags")}</div>;
      if (rule.kind === "group_spread_table") return <div className="grid gap-2"><MultiParticipants value={Array.isArray(params.participant_ids) ? params.participant_ids as string[] : []} onChange={(value) => set("participant_ids", value)} participants={participants} /><Input type="number" min="1" value={Number(params.max_per_table ?? 1)} onChange={(event) => set("max_per_table", Number(event.target.value))} placeholder="Maximum par table" /></div>;
      if (rule.kind === "alternate_tag") return <div className="grid gap-2 sm:grid-cols-2"><Input value={String(params.tag ?? "")} onChange={(event) => set("tag", event.target.value)} placeholder="Tag à alterner" /><Select value={String(params.relation ?? "adjacent")} onValueChange={(value) => set("relation", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{relationOptions.slice(0, 2).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>;
      if (rule.kind === "max_board_distance") return <div className="grid gap-2 sm:grid-cols-[1fr_180px]">{participant("participant_id")}<Input type="number" value={Number(params.max_distance ?? 300)} onChange={(event) => set("max_distance", Number(event.target.value))} /></div>;
      return <Textarea value={JSON.stringify(params, null, 2)} readOnly className="font-mono text-xs" />;
  }
}

function NewRuleDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (rule: Rule) => void }) {
  const [kind, setKind] = useState<RuleKind>("fixed_seat");
  const [name, setName] = useState("");
  const selected = kinds.find((item) => item.value === kind)!;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Ajouter une contrainte</DialogTitle><DialogDescription>Une règle dure ne peut jamais être violée. Une règle souple influence le score.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Type</Label><Select value={kind} onValueChange={(value) => setKind((value ?? "fixed_seat") as RuleKind)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{kinds.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{selected.description}</p></div>
          <div className="grid gap-2"><Label>Nom</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={selected.label} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button><Button onClick={() => { onCreate({ id: newId("rule"), name: name.trim() || selected.label, kind, hard: true, weight: 100, params: ruleDefaults(kind), enabled: true, source: "admin", explanation: "" } as unknown as Rule); setName(""); onOpenChange(false); }}>Ajouter</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConstraintsEditor({ rules, participants, room, onChange }: { rules: Rule[]; participants: Participant[]; room: Room; onChange: (rules: Rule[]) => void }) {
  const [open, setOpen] = useState(false);
  const update = (id: string, patch: Record<string, unknown>) =>
    onChange(rules.map((rule) => (rule.id === id ? ({ ...rule, ...patch } as Rule) : rule)));
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-sm font-medium">Règles de placement</h2><p className="mt-1 text-xs text-muted-foreground">{rules.length} règle{rules.length !== 1 ? "s" : ""}, dont {rules.filter((rule) => rule.hard).length} dure{rules.filter((rule) => rule.hard).length !== 1 ? "s" : ""}.</p></div>
        <Button onClick={() => setOpen(true)}><Plus /> Ajouter une contrainte</Button>
      </div>
      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center"><Shield className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-4 font-medium">Aucune règle administrateur</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Les préférences du formulaire suffisent pour commencer. Ajoutez ici les besoins médicaux, groupes, quotas ou alternances.</p></div>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.enabled ? "opacity-60" : undefined}>
              <CardHeader className="flex-row items-start gap-3 px-5">
                <GripVertical className="mt-1 size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1"><CardTitle className="text-sm">{rule.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{kinds.find((item) => item.value === rule.kind)?.description}</p></div>
                <Badge variant={rule.hard ? "default" : "secondary"}>{rule.hard ? <Shield /> : <Sparkles />}{rule.hard ? "Dure" : "Souple"}</Badge>
                <Switch checked={rule.enabled} onCheckedChange={(enabled) => update(rule.id, { enabled })} aria-label={`Activer ${rule.name}`} />
                <Button size="icon-sm" variant="ghost" onClick={() => onChange(rules.filter((item) => item.id !== rule.id))} aria-label={`Supprimer ${rule.name}`}><Trash2 /></Button>
              </CardHeader>
              <CardContent className="grid gap-4 px-5">
                <ParamsEditor rule={rule} participants={participants} room={room} onParams={(params) => update(rule.id, { params })} />
                <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_140px_1fr]">
                  <label className="flex items-center gap-2 text-xs"><Switch checked={rule.hard} onCheckedChange={(hard) => update(rule.id, { hard })} /> Contrainte dure</label>
                  {!rule.hard && <div className="grid gap-1"><Label className="text-xs">Poids</Label><Input type="number" min="1" max="1000000" value={rule.weight} onChange={(event) => update(rule.id, { weight: Number(event.target.value) || 1 })} /></div>}
                  <div className="grid gap-1 sm:col-start-3"><Label className="text-xs">Justification / note privée</Label><Input value={rule.explanation} onChange={(event) => update(rule.id, { explanation: event.target.value })} placeholder="Pourquoi cette règle existe" /></div>
                </div>
                {rule.hard && !rule.enabled && <p className="flex items-center gap-2 text-xs text-amber-600"><AlertTriangle className="size-3.5" /> Cette règle dure est désactivée.</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <NewRuleDialog open={open} onOpenChange={setOpen} onCreate={(rule) => onChange([...rules, rule])} />
    </div>
  );
}
