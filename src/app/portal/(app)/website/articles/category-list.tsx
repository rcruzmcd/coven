"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, Plus } from "lucide-react";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { useActionToast } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { articleSlugify } from "@/lib/articles";
import { formatDateTime } from "@/lib/format";
import type { EditorCategory } from "./article-shared";
import {
  deleteArticleCategoryAction,
  discardArticleDraftsAction,
  publishArticleCategoryAction,
  reorderArticleCategoriesAction,
  saveArticleDraftsAction,
} from "./actions";

const SITE_CONTENT = "/portal/website";

function attribution(category: EditorCategory): string | null {
  const lines: string[] = [];
  if (category.hasDraft && category.draftUpdatedAt) {
    lines.push(
      `Draft saved ${formatDateTime(category.draftUpdatedAt)}${
        category.draftUpdatedBy ? ` by ${category.draftUpdatedBy}` : ""
      }`,
    );
  }
  if (category.publishedAt) {
    lines.push(
      `Published ${formatDateTime(category.publishedAt)}${
        category.publishedBy ? ` by ${category.publishedBy}` : ""
      }`,
    );
  }
  return lines.length > 0 ? lines.join(" · ") : null;
}

/**
 * The Learn index, as the people who write it see it (#894).
 *
 * Categories are ordered, created, published and removed from here; the words
 * inside one are edited on its own page. The split follows what publishing
 * does: `publish_article_category` moves a category and everything on it in
 * one statement, so a page is the unit of work in both directions.
 */
export function CategoryList({
  categories,
  canEdit,
  learnHidden,
}: {
  categories: readonly EditorCategory[];
  canEdit: boolean;
  learnHidden: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const { isPending, run } = useActionToast();

  // Reordering is a draft like any other edit, so the server is the only place
  // the new order lives: no local copy of `categories` to fall out of step
  // with a refresh, a discard, or another editor's save.
  function move(index: number, direction: -1 | 1) {
    const to = index + direction;
    if (to < 0 || to >= categories.length) return;
    const next = [...categories];
    [next[index], next[to]] = [next[to], next[index]];
    run(() => reorderArticleCategoriesAction(next.map((entry) => entry.id)), {
      success: "Order saved as a draft.",
      description: "Publish each category you moved to change the site.",
      onSuccess: () => router.refresh(),
    });
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSlug = slug || articleSlugify(title);
    run(
      () =>
        saveArticleDraftsAction(
          { slug: nextSlug, value: { title, description: "" } },
          [],
        ),
      {
        success: `${title} created as a draft.`,
        onSuccess: (result) => {
          setTitle("");
          setSlug("");
          setSlugEdited(false);
          router.push(`${SITE_CONTENT}/articles/${result.categoryId}`);
        },
      },
    );
  }

  return (
    <>
      <PortalBreadcrumbs current="Articles" />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Articles
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        The guides on the public Learn section, grouped into categories. Each
        category is a page at <code>/learn/&lt;address&gt;</code>. Saving keeps
        a draft; nothing reaches the public site until you publish the category.
      </p>

      {learnHidden && (
        <Alert className="mt-6 max-w-3xl">
          <EyeOff />
          <AlertDescription>
            The Learn section is switched off, so none of these pages is
            reachable on the public site. Turn it on in{" "}
            <Link
              href="/portal/website/page-visibility"
              className="underline underline-offset-4"
            >
              Page visibility
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {canEdit && (
        <Card className="mt-6 max-w-3xl">
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <RequiredFieldsNote />
              <Field>
                <FieldLabel htmlFor="new-category-title" required>
                  New category
                </FieldLabel>
                <Input
                  id="new-category-title"
                  value={title}
                  placeholder="Getting Started"
                  required
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (!slugEdited)
                      setSlug(articleSlugify(event.target.value));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-category-slug" required>
                  Web address
                </FieldLabel>
                <Input
                  id="new-category-slug"
                  value={slug}
                  placeholder="getting-started"
                  required
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(articleSlugify(event.target.value));
                  }}
                />
                <FieldDescription>
                  The page will be at /learn/{slug || "…"}. This is how people
                  link to it, so it is worth getting right before you publish.
                </FieldDescription>
              </Field>
              <Button type="submit" size="sm" disabled={isPending || !title}>
                {isPending ? <Spinner /> : <Plus />}
                Add category
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 max-w-3xl space-y-3">
        {categories.length === 0 && (
          <p className="app-muted text-sm italic">
            No categories yet. The Learn section renders empty until one is
            published.
          </p>
        )}

        {categories.map((category, index) => {
          const note = attribution(category);
          return (
            <Card key={category.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`${SITE_CONTENT}/articles/${category.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {category.body.title || category.slug}
                      </Link>
                      {category.pendingRemoval && (
                        <Badge variant="destructive">Removal pending</Badge>
                      )}
                      {!category.pendingRemoval && category.unpublished && (
                        <Badge variant="secondary">Not published</Badge>
                      )}
                      {!category.pendingRemoval &&
                        !category.unpublished &&
                        (category.hasDraft || category.articlesHaveDrafts) && (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                    </div>
                    <p className="app-muted mt-1 text-sm">
                      /learn/{category.slug} · {category.articleCount}{" "}
                      {category.articleCount === 1 ? "article" : "articles"}
                    </p>
                    {note && <p className="app-muted mt-1 text-xs">{note}</p>}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Move ${category.body.title || category.slug} up`}
                              disabled={index === 0 || isPending}
                              onClick={() => move(index, -1)}
                            />
                          }
                        >
                          <ArrowUp />
                        </TooltipTrigger>
                        <TooltipContent>{`Move ${category.body.title || category.slug} up`}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Move ${category.body.title || category.slug} down`}
                              disabled={
                                index === categories.length - 1 || isPending
                              }
                              onClick={() => move(index, 1)}
                            />
                          }
                        >
                          <ArrowDown />
                        </TooltipTrigger>
                        <TooltipContent>{`Move ${category.body.title || category.slug} down`}</TooltipContent>
                      </Tooltip>
                      <ConfirmDeleteButton
                        label={`Remove ${category.body.title || category.slug}`}
                        title={`Remove ${category.body.title || category.slug}?`}
                        description={
                          category.unpublished
                            ? "This category has never been published, so it goes now, along with everything written on it."
                            : "This stages the removal of the category and every article on it. Publish the category to take it off the public site."
                        }
                        confirmLabel="Remove"
                        pending={isPending}
                        onConfirm={() =>
                          run(() => deleteArticleCategoryAction(category.id), {
                            success: category.unpublished
                              ? "Category removed."
                              : "Removal staged. Publish to take it off the site.",
                            onSuccess: () => router.refresh(),
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                {canEdit &&
                  (category.hasDraft || category.articlesHaveDrafts) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isPending}
                        focusableWhenDisabled
                        onClick={() =>
                          run(() => publishArticleCategoryAction(category.id), {
                            success: category.pendingRemoval
                              ? "Category removed from the public site."
                              : `${category.body.title || category.slug} published.`,
                            onSuccess: () => router.refresh(),
                          })
                        }
                      >
                        {isPending && <Spinner />}
                        Publish
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        focusableWhenDisabled
                        onClick={() =>
                          run(() => discardArticleDraftsAction(category.id), {
                            success: "Draft discarded.",
                            onSuccess: () => router.refresh(),
                          })
                        }
                      >
                        Discard draft
                      </Button>
                    </div>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
