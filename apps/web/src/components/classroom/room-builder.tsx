"use client";

import { newId } from "@plan2classe-app/api/domain/defaults";
import type { Furniture, Room, Seat, SeatRelation } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Checkbox } from "@plan2classe-app/ui/components/checkbox";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plan2classe-app/ui/components/select";
import { Separator } from "@plan2classe-app/ui/components/separator";
import { ScrollArea } from "@plan2classe-app/ui/components/scroll-area";
import {
  Armchair,
  Circle,
  Grid2X2,
  Link2,
  PanelTop,
  Plus,
  RectangleHorizontal,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { RoomCanvas, type RoomSelection } from "./room-canvas";

const relationLabels = {
  adjacent: "Voisins directs",
  near: "Proches",
  same_table: "Même table",
  same_cluster: "Même îlot",
  hand_conflict: "Collision de main",
} as const;

function makeSeat(label: string, x: number, y: number, furnitureId: string | null): Seat {
  return {
    id: newId("seat"),
    label,
    x,
    y,
    rotation: 0,
    furniture_id: furnitureId,
    cluster_id: null,
    tags: [],
    side: null,
    enabled: true,
    metadata: {},
  };
}

function preset(
  room: Room,
  kind: "double" | "island" | "round" | "u" | "free",
): { furniture?: Furniture; seats: Seat[]; relations: SeatRelation[] } {
  if (kind === "free") {
    return {
      seats: [makeSeat(`P${room.seats.length + 1}`, room.width / 2, room.height / 2, null)],
      relations: [],
    };
  }
  const id = newId("furniture");
  const count = kind === "double" ? 2 : kind === "island" ? 4 : kind === "round" ? 6 : 8;
  const width = kind === "u" ? 300 : kind === "round" ? 190 : kind === "island" ? 220 : 170;
  const height = kind === "u" ? 190 : kind === "round" ? 150 : kind === "island" ? 130 : 70;
  const x = Math.round(room.width / 2 - width / 2);
  const y = Math.round(room.height / 2 - height / 2);
  const furniture: Furniture = {
    id,
    label:
      kind === "double"
        ? "Table double"
        : kind === "island"
          ? "Îlot 4 places"
          : kind === "round"
            ? "Table ronde"
            : "Table en U",
    shape: kind === "round" ? "ellipse" : kind === "u" ? "composite" : "rectangle",
    x,
    y,
    width,
    height,
    rotation: 0,
    points: [],
    parts: kind === "u" ? [{ x: 0, y: 0, width: 40, height }, { x: width - 40, y: 0, width: 40, height }, { x: 0, y: height - 40, width, height: 40 }] : [],
    tags: [],
    cluster_id: null,
  };
  const seats: Seat[] = [];
  if (kind === "double") {
    seats.push(makeSeat(`P${room.seats.length + 1}`, x + 45, y + height + 22, id));
    seats.push(makeSeat(`P${room.seats.length + 2}`, x + width - 45, y + height + 22, id));
  } else if (kind === "island") {
    const positions = [
      [x + 45, y - 18],
      [x + width - 45, y - 18],
      [x + 45, y + height + 18],
      [x + width - 45, y + height + 18],
    ];
    positions.forEach(([seatX, seatY], index) =>
      seats.push(makeSeat(`P${room.seats.length + index + 1}`, seatX, seatY, id)),
    );
  } else if (kind === "round") {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      seats.push(
        makeSeat(
          `P${room.seats.length + index + 1}`,
          x + width / 2 + Math.cos(angle) * (width * 0.58),
          y + height / 2 + Math.sin(angle) * (height * 0.68),
          id,
        ),
      );
    }
  } else {
    const positions = [
      [x - 18, y + 35],
      [x - 18, y + 95],
      [x - 18, y + 155],
      [x + 55, y + height + 18],
      [x + width - 55, y + height + 18],
      [x + width + 18, y + 155],
      [x + width + 18, y + 95],
      [x + width + 18, y + 35],
    ];
    positions.forEach(([seatX, seatY], index) =>
      seats.push(makeSeat(`P${room.seats.length + index + 1}`, seatX, seatY, id)),
    );
  }
  const relations: SeatRelation[] = [];
  for (let index = 0; index < seats.length - 1; index += 1) {
    relations.push({
      a: seats[index]!.id,
      b: seats[index + 1]!.id,
      kinds: ["adjacent", "near", "same_table"],
      bidirectional: true,
    });
  }
  return { furniture, seats, relations };
}

export function RoomBuilder({ room, onChange }: { room: Room; onChange: (room: Room) => void }) {
  const [selection, setSelection] = useState<RoomSelection>(null);
  const [relationA, setRelationA] = useState("");
  const [relationB, setRelationB] = useState("");
  const [relationKinds, setRelationKinds] = useState<Array<keyof typeof relationLabels>>(["adjacent"]);
  const selectedSeat = selection?.type === "seat" ? room.seats.find((seat) => seat.id === selection.id) : undefined;
  const selectedFurniture = selection?.type === "furniture" ? room.furniture.find((item) => item.id === selection.id) : undefined;
  const seatOptions = useMemo(() => room.seats.filter((seat) => seat.enabled), [room.seats]);

  const addPreset = (kind: Parameters<typeof preset>[1]) => {
    const next = preset(room, kind);
    onChange({
      ...room,
      furniture: next.furniture ? [...room.furniture, next.furniture] : room.furniture,
      seats: [...room.seats, ...next.seats],
      relations: [...room.relations, ...next.relations],
    });
    setSelection(next.furniture ? { type: "furniture", id: next.furniture.id } : { type: "seat", id: next.seats[0]!.id });
  };

  const move = (target: Exclude<RoomSelection, null>, x: number, y: number) => {
    if (target.type === "board") {
      onChange({ ...room, board: { ...room.board, x, y } });
      return;
    }
    if (target.type === "seat") {
      onChange({ ...room, seats: room.seats.map((seat) => (seat.id === target.id ? { ...seat, x, y } : seat)) });
      return;
    }
    const furniture = room.furniture.find((item) => item.id === target.id);
    if (!furniture) return;
    const dx = x - furniture.x;
    const dy = y - furniture.y;
    onChange({
      ...room,
      furniture: room.furniture.map((item) => (item.id === target.id ? { ...item, x, y } : item)),
      seats: room.seats.map((seat) =>
        seat.furniture_id === target.id ? { ...seat, x: seat.x + dx, y: seat.y + dy } : seat,
      ),
    });
  };

  const updateSeat = (patch: Partial<Seat>) => {
    if (!selectedSeat) return;
    onChange({ ...room, seats: room.seats.map((seat) => (seat.id === selectedSeat.id ? { ...seat, ...patch } : seat)) });
  };
  const updateFurniture = (patch: Partial<Furniture>) => {
    if (!selectedFurniture) return;
    onChange({ ...room, furniture: room.furniture.map((item) => (item.id === selectedFurniture.id ? { ...item, ...patch } : item)) });
  };

  const removeSelection = () => {
    if (!selection) return;
    if (selection.type === "seat") {
      onChange({
        ...room,
        seats: room.seats.filter((seat) => seat.id !== selection.id),
        relations: room.relations.filter((relation) => relation.a !== selection.id && relation.b !== selection.id),
      });
    } else if (selection.type === "furniture") {
      const removedSeatIds = new Set(room.seats.filter((seat) => seat.furniture_id === selection.id).map((seat) => seat.id));
      onChange({
        ...room,
        furniture: room.furniture.filter((item) => item.id !== selection.id),
        seats: room.seats.filter((seat) => !removedSeatIds.has(seat.id)),
        relations: room.relations.filter((relation) => !removedSeatIds.has(relation.a) && !removedSeatIds.has(relation.b)),
      });
    }
    setSelection(null);
  };

  const addSeatToFurniture = () => {
    if (!selectedFurniture) return;
    const seat = makeSeat(
      `P${room.seats.length + 1}`,
      selectedFurniture.x + selectedFurniture.width / 2,
      selectedFurniture.y + selectedFurniture.height + 22,
      selectedFurniture.id,
    );
    onChange({ ...room, seats: [...room.seats, seat] });
    setSelection({ type: "seat", id: seat.id });
  };

  const addRelation = () => {
    if (!relationA || !relationB || relationA === relationB || relationKinds.length === 0) return;
    const existing = room.relations.find(
      (relation) =>
        (relation.a === relationA && relation.b === relationB) ||
        (relation.bidirectional && relation.a === relationB && relation.b === relationA),
    );
    const relations = existing
      ? room.relations.map((relation) =>
          relation === existing
            ? { ...relation, kinds: [...new Set([...relation.kinds, ...relationKinds])] }
            : relation,
        )
      : [...room.relations, { a: relationA, b: relationB, kinds: relationKinds, bidirectional: true }];
    onChange({ ...room, relations });
  };

  return (
    <div className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
          <span className="px-2 text-xs font-medium text-muted-foreground">Ajouter</span>
          <Button size="sm" variant="outline" onClick={() => addPreset("double")}><RectangleHorizontal /> Table double</Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("island")}><Grid2X2 /> Îlot 4</Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("round")}><Circle /> Ronde 6</Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("u")}><PanelTop /> U 8</Button>
          <Button size="sm" variant="outline" onClick={() => addPreset("free")}><Armchair /> Siège libre</Button>
          <Badge variant="secondary" className="ml-auto">{room.seats.filter((seat) => seat.enabled).length} places</Badge>
        </div>
        <RoomCanvas
          room={room}
          editable
          selection={selection}
          onSelectionChange={setSelection}
          onMove={move}
          className="min-h-[520px]"
        />
        <p className="text-xs text-muted-foreground">
          Glissez les tables et les sièges. La forme est visuelle ; le moteur utilise le graphe de relations entre places.
        </p>
      </div>

      <Card className="h-fit max-h-[760px] gap-0 py-0 shadow-none xl:sticky xl:top-20">
        <CardHeader className="border-b px-4 py-4">
          <CardTitle className="text-sm">Inspecteur</CardTitle>
        </CardHeader>
        <ScrollArea className="max-h-[690px]">
          <CardContent className="grid gap-5 px-4 py-4">
            {!selection && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Sélectionnez une table, un siège ou le tableau.
              </div>
            )}
            {selection?.type === "board" && (
              <>
                <div className="grid gap-2"><Label>Libellé</Label><Input value={room.board.label} onChange={(event) => onChange({ ...room, board: { ...room.board, label: event.target.value } })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2"><Label>X</Label><Input type="number" value={room.board.x} onChange={(event) => onChange({ ...room, board: { ...room.board, x: Number(event.target.value) } })} /></div>
                  <div className="grid gap-2"><Label>Y</Label><Input type="number" value={room.board.y} onChange={(event) => onChange({ ...room, board: { ...room.board, y: Number(event.target.value) } })} /></div>
                </div>
                <div className="grid gap-2"><Label>Largeur</Label><Input type="number" value={room.board.width} onChange={(event) => onChange({ ...room, board: { ...room.board, width: Math.max(20, Number(event.target.value)) } })} /></div>
              </>
            )}
            {selectedFurniture && (
              <>
                <div className="grid gap-2"><Label>Nom</Label><Input value={selectedFurniture.label} onChange={(event) => updateFurniture({ label: event.target.value })} /></div>
                <div className="grid gap-2">
                  <Label>Forme</Label>
                  <Select value={selectedFurniture.shape} onValueChange={(value) => updateFurniture({ shape: value as Furniture["shape"] })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rectangle">Rectangle</SelectItem><SelectItem value="ellipse">Ellipse</SelectItem><SelectItem value="polygon">Polygone</SelectItem><SelectItem value="composite">Composite / U</SelectItem><SelectItem value="line">Ligne</SelectItem><SelectItem value="free">Libre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2"><Label>Largeur</Label><Input type="number" value={selectedFurniture.width} onChange={(event) => updateFurniture({ width: Math.max(20, Number(event.target.value)) })} /></div>
                  <div className="grid gap-2"><Label>Hauteur</Label><Input type="number" value={selectedFurniture.height} onChange={(event) => updateFurniture({ height: Math.max(10, Number(event.target.value)) })} /></div>
                </div>
                <div className="grid gap-2"><Label className="flex items-center gap-2"><RotateCw className="size-3.5" /> Rotation</Label><Input type="number" value={selectedFurniture.rotation} onChange={(event) => updateFurniture({ rotation: Number(event.target.value) })} /></div>
                <div className="grid gap-2"><Label>Tags (séparés par des virgules)</Label><Input value={selectedFurniture.tags.join(", ")} onChange={(event) => updateFurniture({ tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></div>
                <Button variant="outline" onClick={addSeatToFurniture}><Plus /> Ajouter un siège</Button>
                <Button variant="destructive" onClick={removeSelection}><Trash2 /> Supprimer table et sièges</Button>
              </>
            )}
            {selectedSeat && (
              <>
                <div className="grid gap-2"><Label>Libellé</Label><Input value={selectedSeat.label} onChange={(event) => updateSeat({ label: event.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2"><Label>X</Label><Input type="number" value={selectedSeat.x} onChange={(event) => updateSeat({ x: Number(event.target.value) })} /></div>
                  <div className="grid gap-2"><Label>Y</Label><Input type="number" value={selectedSeat.y} onChange={(event) => updateSeat({ y: Number(event.target.value) })} /></div>
                </div>
                <div className="grid gap-2"><Label>Côté</Label><Select value={selectedSeat.side ?? "none"} onValueChange={(value) => updateSeat({ side: value === "none" ? null : value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Non défini</SelectItem><SelectItem value="left">Gauche</SelectItem><SelectItem value="right">Droite</SelectItem></SelectContent></Select></div>
                <div className="grid gap-2"><Label>Tags</Label><Input value={selectedSeat.tags.join(", ")} onChange={(event) => updateSeat({ tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></div>
                <Button variant="destructive" onClick={removeSelection}><Trash2 /> Supprimer le siège</Button>
              </>
            )}

            <Separator />
            <div>
              <div className="mb-3 flex items-center gap-2"><Link2 className="size-4" /><h3 className="text-sm font-medium">Relation explicite</h3></div>
              <div className="grid gap-2">
                <Select value={relationA} onValueChange={(value) => setRelationA(value ?? "")}><SelectTrigger className="w-full"><SelectValue placeholder="Première place" /></SelectTrigger><SelectContent>{seatOptions.map((seat) => <SelectItem key={seat.id} value={seat.id}>{seat.label}</SelectItem>)}</SelectContent></Select>
                <Select value={relationB} onValueChange={(value) => setRelationB(value ?? "")}><SelectTrigger className="w-full"><SelectValue placeholder="Deuxième place" /></SelectTrigger><SelectContent>{seatOptions.map((seat) => <SelectItem key={seat.id} value={seat.id}>{seat.label}</SelectItem>)}</SelectContent></Select>
                <div className="grid gap-2 py-1">
                  {Object.entries(relationLabels).map(([kind, label]) => (
                    <label key={kind} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={relationKinds.includes(kind as keyof typeof relationLabels)} onCheckedChange={(checked) => setRelationKinds((current) => checked ? [...new Set([...current, kind as keyof typeof relationLabels])] : current.filter((item) => item !== kind))} />
                      {label}
                    </label>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={addRelation} disabled={!relationA || !relationB || relationA === relationB}>Enregistrer la relation</Button>
              </div>
            </div>
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}
