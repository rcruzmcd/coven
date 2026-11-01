"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trackForm } from "@/lib/analytics/form-events";
import { VolunteerApplicationForm } from "./volunteer-application-form-fields";

export function VolunteerApplicationSheet({
  screeningNotes,
}: {
  screeningNotes: string[];
}) {
  const [open, setOpen] = useState(false);

  // The form is shown when the sheet opens (#1713), not when the page loads.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) trackForm("volunteer_application", "form_viewed", {});
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button />}>Apply to volunteer</SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle className="text-xl">Apply to volunteer</SheetTitle>
          <SheetDescription>
            Tell us a bit about yourself and we&apos;ll follow up about getting
            you plugged in.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <VolunteerApplicationForm screeningNotes={screeningNotes} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
