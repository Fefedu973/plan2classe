import { buttonVariants } from "@plan2classe-app/ui/components/button";
import { cn } from "@plan2classe-app/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";

type LinkButtonProps = ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the link inert while keeping it in the tab order-free state. */
    disabled?: boolean;
  };

/**
 * A navigation link that looks like a button.
 *
 * Passing a `<Link>` through Base UI's `<Button render>` makes it announce as a
 * button and drops link affordances (middle-click, open in new tab). Styling a
 * real anchor keeps the semantics honest and the visuals identical.
 */
export function LinkButton({
  className,
  variant,
  size,
  disabled = false,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : props.tabIndex}
      {...props}
    />
  );
}
