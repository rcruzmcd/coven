"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Submit button for the toolbar search form. Same reason FilterSubmitButton
 * exists: a native GET submission is a full document navigation with no React
 * pending state, so this listens to its own form's submit event and shows
 * progress until the new page arrives (#482).
 */
export function SearchSubmitButton() {
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
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            ref={ref}
            type="submit"
            variant="secondary"
            size="icon-sm"
            aria-label="Search"
            disabled={pending}
            focusableWhenDisabled
            aria-busy={pending || undefined}
          />
        }
      >
        {pending ? <Spinner /> : <Search />}
      </TooltipTrigger>
      <TooltipContent>Search</TooltipContent>
    </Tooltip>
  );
}
