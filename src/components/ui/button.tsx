"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  disabled,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border font-bold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pbl-teacher)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher)] text-white shadow-sm hover:bg-[var(--pbl-teacher-hover)]",
        variant === "secondary" && "border-[var(--pbl-border-strong)] bg-[var(--pbl-surface)] text-[var(--pbl-text)] hover:bg-[var(--pbl-surface-soft)]",
        variant === "text" && "border-transparent bg-transparent text-[var(--pbl-teacher)] hover:bg-[var(--pbl-teacher-soft)]",
        variant === "danger" && "border-[var(--pbl-danger)] bg-[var(--pbl-danger)] text-white hover:brightness-90",
        size === "sm" && "min-h-9 px-3 text-sm",
        size === "md" && "px-4 text-sm",
        size === "lg" && "min-h-12 px-5 text-base",
        className,
      )}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" size={17} /> : null}
      {children}
    </button>
  );
}
