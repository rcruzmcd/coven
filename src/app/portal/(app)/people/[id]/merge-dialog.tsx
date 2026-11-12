"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PersonPicker, type PickedPerson } from "../person-picker";
import type { PersonListItem } from "../actions";

/**
 * Entry point to the merge review for an arbitrary pair.
 *
 * The Duplicates queue only lists records that share an address, and once the
 * unique index is on (20260904190000) nothing can. The case that outlives it is
 * one person who signed up twice under two different addresses, which only a
 * human can spot -- so the merge has to be reachable from the record itself,
 * not just from the queue.
 *
 * A dialog on the Profile card rather than a card of its own (#1108). Merging
 * is a rare, deliberate, one-way act on the record this page is already about,
 * so it belongs with the record's other controls; as a card it took a column
 * slot on every visit, permanently, next to the things people came to read.
 */
export function MergeDialog({
  personId,
  people,
}: {
  personId: string;
  people: PersonListItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedPerson | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <DialogTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Merge a duplicate"
                />
              }
            />
          }
        >
          <Merge />
        </DialogTrigger>
        <TooltipContent>Merge a duplicate</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge a duplicate</DialogTitle>
          <DialogDescription>
            Pick the record that is the same person as this one. Everything on
            it moves here, and it is then deleted. You will see what moves
            before anything happens.
          </DialogDescription>
        </DialogHeader>

        <PersonPicker
          aria-label="Duplicate record"
          people={people}
          selected={picked}
          onSelect={setPicked}
          onPersonCreated={() => {}}
          allowCreate={false}
          placeholder="Search for the duplicate record..."
        />

        <DialogFooter>
          <Button
            disabled={!picked}
            onClick={() =>
              router.push(
                `/portal/people/duplicates?survivor=${personId}&duplicate=${picked!.id}`,
              )
            }
          >
            Review merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
