"use client";

import { Toaster } from "sonner";

export { toast } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      closeButton
      position="top-right"
      richColors={false}
      toastOptions={{
        classNames: {
          toast: "!rounded-[var(--radius-md)] !border-[var(--pbl-border)] !bg-[var(--pbl-surface-raised)] !text-[var(--pbl-text)] !shadow-[var(--shadow-floating)]",
          description: "!text-[var(--pbl-text-muted)]",
        },
      }}
    />
  );
}
