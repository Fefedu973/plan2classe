"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plan2classe-app/ui/components/select";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { useMemo } from "react";

export type SelectOption<Value extends string = string> = {
  value: Value;
  label: string;
  description?: string;
};

type OptionSelectProps<Value extends string> = {
  value: Value | "";
  onValueChange: (value: Value) => void;
  options: ReadonlyArray<SelectOption<Value>>;
  placeholder?: string;
  /** Shown in the trigger when `options` is empty, instead of the placeholder. */
  emptyLabel?: string;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

/**
 * Base UI resolves the trigger label from `Select.Root`'s `items` prop; without
 * it the trigger prints the raw value (`unknown`, `seat_a1b2…`) instead of the
 * human label. This wrapper keeps the two in sync so that can never drift.
 */
export function OptionSelect<Value extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Sélectionner…",
  emptyLabel = "Aucun choix disponible",
  className,
  contentClassName,
  size = "default",
  disabled = false,
  id,
  "aria-label": ariaLabel,
}: OptionSelectProps<Value>) {
  const items = useMemo(
    () => options.map((option) => ({ label: option.label, value: option.value })),
    [options],
  );
  const isEmpty = options.length === 0;

  return (
    <Select<Value | "">
      items={items}
      value={value}
      onValueChange={(next) => onValueChange((next ?? "") as Value)}
      disabled={disabled || isEmpty}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={isEmpty ? emptyLabel : placeholder} />
      </SelectTrigger>
      <SelectContent className={cn("max-h-72", contentClassName)}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate">{option.label}</span>
              {option.description ? (
                <span className="truncate text-xs text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
