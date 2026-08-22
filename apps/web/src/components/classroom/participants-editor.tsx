"use client";

import { createParticipant } from "@plan2classe-app/api/domain/defaults";
import type { Participant } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plan2classe-app/ui/components/table";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { Clipboard, FileUp, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function parseTags(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split(":");
        return [key!.trim(), rest.join(":").trim() || "true"];
      }),
  );
}

function serializeTags(tags: Record<string, string>) {
  return Object.entries(tags)
    .map(([key, value]) => `${key}:${value}`)
    .join(", ");
}

function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (participants: Participant[]) => void;
}) {
  const [value, setValue] = useState("");
  const parse = () => {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const participants = lines
      .filter((line, index) => !(index === 0 && /^(nom|name)[,;]/i.test(line)))
      .map((line) => {
        const delimiter = line.includes(";") ? ";" : ",";
        const [name = "", tags = "", grade = "", handedness = "", vision = "", hearing = ""] = line
          .split(delimiter)
          .map((cell) => cell.trim());
        const participant = createParticipant(name);
        participant.tags = parseTags(tags);
        participant.grade = grade ? Number(grade.replace(",", ".")) : null;
        participant.handedness = handedness.toUpperCase() === "L" ? "left" : handedness.toUpperCase() === "R" ? "right" : "unknown";
        participant.vision_need = vision ? Math.min(5, Math.max(0, Number(vision))) : 0;
        participant.hearing_need = hearing ? Math.min(5, Math.max(0, Number(hearing))) : 0;
        return participant;
      })
      .filter((participant) => participant.name);
    onImport(participants);
    setValue("");
    onOpenChange(false);
    toast.success(`${participants.length} élève${participants.length > 1 ? "s" : ""} importé${participants.length > 1 ? "s" : ""}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer une liste</DialogTitle>
          <DialogDescription>
            Collez une ligne par élève, ou un CSV : nom ; tags ; note ; main ; vision ; audition.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-64 font-mono text-xs"
          placeholder={"Nom;tags;note;main;vision;audition\nAlice Dupont;genre:F, groupe:1;15;R;0;0\nBob Martin;genre:M, groupe:2;11;L;2;1"}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={parse} disabled={!value.trim()}><FileUp /> Importer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ParticipantsEditor({
  participants,
  onChange,
}: {
  participants: Participant[];
  onChange: (participants: Participant[]) => void;
}) {
  const [name, setName] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const update = (id: string, patch: Partial<Participant>) =>
    onChange(participants.map((participant) => (participant.id === id ? { ...participant, ...patch } : participant)));

  const add = () => {
    if (!name.trim()) return;
    onChange([...participants, createParticipant(name)]);
    setName("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="new-participant">Ajouter un élève</Label>
          <Input
            id="new-participant"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && add()}
            placeholder="Prénom NOM"
          />
        </div>
        <Button onClick={add} disabled={!name.trim()}><Plus /> Ajouter</Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp /> Importer CSV</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary"><UserRound /> {participants.length} élèves</Badge>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Les besoins sensibles ne sont jamais affichés dans le formulaire public.</span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">Élève</TableHead>
                <TableHead className="min-w-56">Tags clé:valeur</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Main</TableHead>
                <TableHead>Vision</TableHead>
                <TableHead>Audition</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead><span className="sr-only">Supprimer</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="h-32 text-center text-muted-foreground">Ajoutez ou importez vos élèves.</TableCell></TableRow>
              ) : participants.map((participant) => (
                <TableRow key={participant.id} className={!participant.active ? "opacity-55" : undefined}>
                  <TableCell><Input value={participant.name} onChange={(event) => update(participant.id, { name: event.target.value })} className="min-w-44" /></TableCell>
                  <TableCell><Input value={serializeTags(participant.tags)} onChange={(event) => update(participant.id, { tags: parseTags(event.target.value) })} placeholder="genre:F, groupe:1" className="min-w-52" /></TableCell>
                  <TableCell><Input type="number" min="0" max="20" step="0.1" value={participant.grade ?? ""} onChange={(event) => update(participant.id, { grade: event.target.value ? Number(event.target.value) : null })} className="w-20" aria-label={`Note de ${participant.name}`} /></TableCell>
                  <TableCell>
                    <Select value={participant.handedness} onValueChange={(value) => update(participant.id, { handedness: (value ?? "unknown") as Participant["handedness"] })}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="right">Droite</SelectItem><SelectItem value="left">Gauche</SelectItem><SelectItem value="ambidextrous">Ambidextre</SelectItem><SelectItem value="unknown">Inconnue</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min="0" max="5" value={participant.vision_need} onChange={(event) => update(participant.id, { vision_need: Math.min(5, Math.max(0, Number(event.target.value))) })} className="w-16" aria-label={`Besoin visuel de ${participant.name}`} /></TableCell>
                  <TableCell><Input type="number" min="0" max="5" value={participant.hearing_need} onChange={(event) => update(participant.id, { hearing_need: Math.min(5, Math.max(0, Number(event.target.value))) })} className="w-16" aria-label={`Besoin auditif de ${participant.name}`} /></TableCell>
                  <TableCell><Input type="number" min="0.01" max="100" step="0.1" value={participant.priority} onChange={(event) => update(participant.id, { priority: Number(event.target.value) || 1 })} className="w-20" aria-label={`Priorité de ${participant.name}`} /></TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="font-mono text-xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(participant.accessCode);
                        toast.success("Code copié");
                      }}
                    >
                      {participant.accessCode}<Clipboard className="size-3" />
                    </Button>
                  </TableCell>
                  <TableCell><Switch checked={participant.active} onCheckedChange={(checked) => update(participant.id, { active: checked })} aria-label={`Activer ${participant.name}`} /></TableCell>
                  <TableCell><Button size="icon-sm" variant="ghost" onClick={() => onChange(participants.filter((item) => item.id !== participant.id))} aria-label={`Supprimer ${participant.name}`}><Trash2 /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(incoming) => onChange([...participants, ...incoming])}
      />
    </div>
  );
}
