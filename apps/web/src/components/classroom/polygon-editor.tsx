"use client";

import { Button } from "@plan2classe-app/ui/components/button";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

type Point = [number, number];

/** Ready-made outlines, so a custom shape never starts from a blank slate. */
const PRESETS: ReadonlyArray<{ label: string; points: Point[] }> = [
  {
    label: "Triangle",
    points: [
      [50, 0],
      [100, 100],
      [0, 100],
    ],
  },
  {
    label: "En L",
    points: [
      [0, 0],
      [45, 0],
      [45, 60],
      [100, 60],
      [100, 100],
      [0, 100],
    ],
  },
  {
    label: "Trapèze",
    points: [
      [18, 0],
      [82, 0],
      [100, 100],
      [0, 100],
    ],
  },
  {
    label: "Hexagone",
    points: [
      [25, 0],
      [75, 0],
      [100, 50],
      [75, 100],
      [25, 100],
      [0, 50],
    ],
  },
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Edits the outline of a free-form piece of furniture. Points are percentages
 * of the furniture's bounding box, which is exactly what the `clip-path` used
 * to render it expects.
 */
export function PolygonEditor({
  points,
  onChange,
}: {
  points: Point[];
  onChange: (points: Point[]) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const toLocal = (clientX: number, clientY: number): Point | null => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return [
      clamp(((clientX - bounds.left) / bounds.width) * 100),
      clamp(((clientY - bounds.top) / bounds.height) * 100),
    ];
  };

  const startDrag = (event: React.PointerEvent, index: number) => {
    event.stopPropagation();
    event.preventDefault();
    setActive(index);
    const move = (moveEvent: PointerEvent) => {
      const next = toLocal(moveEvent.clientX, moveEvent.clientY);
      if (!next) return;
      onChange(points.map((point, position) => (position === index ? next : point)));
    };
    const end = () => {
      setActive(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  /** A click on the outline adds a point on the nearest edge, keeping order. */
  const addPointAt = (event: React.PointerEvent) => {
    const next = toLocal(event.clientX, event.clientY);
    if (!next) return;
    if (points.length < 3) {
      onChange([...points, next]);
      return;
    }
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index]!;
      const b = points[(index + 1) % points.length]!;
      const midX = (a[0] + b[0]) / 2;
      const midY = (a[1] + b[1]) / 2;
      const distance = (midX - next[0]) ** 2 + (midY - next[1]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index + 1;
      }
    }
    onChange([...points.slice(0, bestIndex), next, ...points.slice(bestIndex)]);
  };

  const removePoint = (index: number) => {
    if (points.length <= 3) return;
    onChange(points.filter((_, position) => position !== index));
  };

  const polygon =
    points.length > 2 ? `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(",")})` : undefined;

  return (
    <div className="grid gap-2">
      <div
        ref={surfaceRef}
        onPointerDown={addPointAt}
        className="relative aspect-4/3 w-full cursor-crosshair rounded-lg border bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_50%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_50%,transparent)_1px,transparent_1px)] bg-[size:12.5%_12.5%] select-none"
        role="application"
        aria-label="Éditeur de forme"
      >
        {polygon ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-foreground/15"
            style={{ clipPath: polygon }}
          />
        ) : (
          <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-muted-foreground">
            Cliquez pour poser au moins trois points.
          </p>
        )}

        {points.map((point, index) => (
          <button
            key={`${index}-${point[0]}-${point[1]}`}
            type="button"
            className={cn(
              "absolute grid size-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-background bg-foreground text-background shadow-sm",
              active === index && "ring-2 ring-primary ring-offset-1",
            )}
            style={{ left: `${point[0]}%`, top: `${point[1]}%` }}
            onPointerDown={(event) => startDrag(event, index)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              removePoint(index);
            }}
            aria-label={`Point ${index + 1} : ${point[0]} %, ${point[1]} %. Double-cliquez pour retirer.`}
          />
        ))}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Cliquez dans le cadre pour ajouter un point, glissez pour le déplacer, double-cliquez
        dessus pour le retirer. {points.length} point{points.length > 1 ? "s" : ""}.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="xs"
            variant="outline"
            onClick={() => onChange(preset.points.map((point) => [...point] as Point))}
          >
            <Plus /> {preset.label}
          </Button>
        ))}
        <Button
          size="xs"
          variant="ghost"
          onClick={() =>
            onChange([
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ])
          }
        >
          <RotateCcw /> Rectangle
        </Button>
        <Button size="xs" variant="ghost" onClick={() => onChange([])} disabled={points.length === 0}>
          <Trash2 /> Effacer
        </Button>
      </div>
    </div>
  );
}
