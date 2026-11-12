"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ComponentProps, ReactNode } from "react";

/**
 * Submit button for GET filter forms. Native GET submissions are full
 * document navigations with no React pending state, so this listens to the
 * enclosing form's submit event and pulses/disables until the new page
 * arrives (#482).
 */
export function FilterSubmitButton({
  children = "Filter",
  variant = "secondary",
  size,
}: {
  children?: ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
}) {
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = () => setPending(true);
    // Restore from bfcache (browser back) keeps component state, so reset.
    const onPageShow = () => setPending(false);
    form.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      form.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <Button
      ref={ref}
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      focusableWhenDisabled
      aria-busy={pending || undefined}
      className={pending ? "animate-pulse" : undefined}
    >
      {children}
    </Button>
  );
}
