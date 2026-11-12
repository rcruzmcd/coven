"use client";

import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/portal/action-toast";
import { formatDateTime } from "@/lib/format";
import type { AvailableContentPack } from "@/lib/content-packs";
import { adoptContentPackAction } from "./packs/actions";

/**
 * The packs this organization may take, and the button that takes one (#895).
 *
 * Everything the copy is arrives as drafts, and the wording says so in both
 * places it can: on the section, and in the receipt. A pack put straight onto
 * the public site would be words under this nonprofit's brand that nobody here
 * has read.
 */
export function PackCatalog({
  packs,
  canAdopt,
}: {
  packs: readonly AvailableContentPack[];
  canAdopt: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();

  // Nothing on offer is the ordinary state, and an empty "Content packs"
  // heading explaining a feature nobody can use is worse than no heading.
  if (packs.length === 0) return null;

  return (
    <section className="mt-10 max-w-3xl">
      <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em]">
        Content packs
      </h2>
      <p className="app-muted mt-2 text-sm leading-relaxed">
        Sets of articles written by the platform. Adopting one copies it into
        this organization as drafts — they become yours to edit, and nothing
        reaches the public site until you publish each category. Later
        improvements to a pack do not reach a copy.
      </p>

      <div className="mt-4 space-y-3">
        {packs.map((pack) => (
          <Card key={pack.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{pack.name}</span>
                  {pack.adoptedAt && (
                    <Badge variant="secondary">
                      Adopted {formatDateTime(pack.adoptedAt)}
                    </Badge>
                  )}
                </div>
                {pack.description && (
                  <p className="app-muted mt-1 text-sm">{pack.description}</p>
                )}
                <p className="app-muted mt-1 text-sm">
                  {pack.categoryCount}{" "}
                  {pack.categoryCount === 1 ? "category" : "categories"} ·{" "}
                  {pack.articleCount}{" "}
                  {pack.articleCount === 1 ? "article" : "articles"}
                </p>
              </div>

              {canAdopt && (
                <Button
                  type="button"
                  variant={pack.adoptedAt ? "outline" : "default"}
                  size="sm"
                  disabled={isPending}
                  focusableWhenDisabled
                  onClick={() =>
                    run(() => adoptContentPackAction(pack.id), {
                      success: (result) =>
                        `${result.packName} copied in as drafts.`,
                      description: (result) =>
                        `${result.categories} ${
                          result.categories === 1 ? "category" : "categories"
                        } and ${result.articles} ${
                          result.articles === 1 ? "article" : "articles"
                        }. Read them, then publish each category.`,
                      onSuccess: () => router.refresh(),
                    })
                  }
                >
                  {isPending ? <Spinner /> : <PackagePlus />}
                  {pack.adoptedAt ? "Adopt again" : "Adopt"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
