"use client";

import { Badge } from "@plan2classe-app/ui/components/badge";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: ReadonlyArray<string>;
  placeholder?: string;
  hint?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

function normalize(tag: string) {
  return tag.trim().replace(/\s+/g, " ");
}

/**
 * Chips with an inline editor, instead of a comma-separated text field: a
 * free-text field silently drops a tag on a stray comma and gives no feedback
 * about which values already exist.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Ajouter un tag…",
  hint,
  className,
  disabled = false,
  "aria-label": ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const available = useMemo(() => {
    const needle = draft.trim().toLocaleLowerCase("fr");
    return suggestions
      .filter((suggestion) => !value.includes(suggestion))
      .filter((suggestion) => !needle || suggestion.toLocaleLowerCase("fr").includes(needle))
      .slice(0, 6);
  }, [draft, suggestions, value]);

  const add = (raw: string) => {
    const tag = normalize(raw);
    if (!tag || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const remove = (tag: string) => onChange(value.filter((item) => item !== tag));

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div
        className={cn(
          "flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          disabled && "pointer-events-none opacity-50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-mono text-[11px]">
            {tag}
            <button
              type="button"
              className="grid size-3.5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                remove(tag);
              }}
              aria-label={`Retirer le tag ${tag}`}
            >
              <X className="size-2.5" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={draft}
          disabled={disabled}
          aria-label={ariaLabel ?? "Ajouter un tag"}
          aria-expanded={open && available.length > 0}
          aria-controls={listId}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            // A pasted "a, b, c" is a list, not one tag.
            if (event.target.value.includes(",")) {
              const parts = event.target.value.split(",");
              const last = parts.pop() ?? "";
              const next = [...value];
              for (const part of parts) {
                const tag = normalize(part);
                if (tag && !next.includes(tag)) next.push(tag);
              }
              onChange(next);
              setDraft(last.trimStart());
              return;
            }
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let a suggestion click land before the list disappears.
            window.setTimeout(() => setOpen(false), 120);
            if (draft.trim()) add(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab") {
              if (!draft.trim()) return;
              event.preventDefault();
              add(draft);
              return;
            }
            if (event.key === "Backspace" && !draft && value.length > 0) {
              event.preventDefault();
              remove(value[value.length - 1]!);
            }
          }}
        />
      </div>

      {open && available.length > 0 ? (
        <div id={listId} className="flex flex-wrap gap-1.5">
          {available.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                add(suggestion);
                inputRef.current?.focus();
              }}
            >
              <Plus className="size-2.5" aria-hidden="true" />
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type KeyValueTagInputProps = {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  suggestions?: ReadonlyArray<string>;
  className?: string;
  "aria-label"?: string;
};

/**
 * Participant tags are `key:value` pairs. They are edited as flat chips so the
 * shape stays visible, and rebuilt into the record on every change.
 */
export function KeyValueTagInput({
  value,
  onChange,
  suggestions,
  className,
  "aria-label": ariaLabel,
}: KeyValueTagInputProps) {
  const flat = useMemo(
    () => Object.entries(value).map(([key, entry]) => (entry === "true" ? key : `${key}:${entry}`)),
    [value],
  );

  return (
    <TagInput
      className={className}
      aria-label={ariaLabel}
      value={flat}
      suggestions={suggestions}
      placeholder="genre:F, groupe:1…"
      onChange={(next) => {
        const record: Record<string, string> = {};
        for (const entry of next) {
          const [key, ...rest] = entry.split(":");
          const cleanKey = key?.trim();
          if (!cleanKey) continue;
          record[cleanKey] = rest.join(":").trim() || "true";
        }
        onChange(record);
      }}
    />
  );
}
