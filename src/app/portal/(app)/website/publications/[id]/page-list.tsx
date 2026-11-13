"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GripVertical,
  ImagePlus,
} from "lucide-react";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { TooltipIconButton } from "@/components/portal/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MarkdownTextarea } from "@/components/portal/markdown-textarea";
import { moveItem, pageHasText } from "@/lib/publications";
import { publicationFileUrl } from "@/lib/storage/publication-files";
import { cn } from "@/lib/utils";
import type { EditorImage, EditorPage } from "../publication-shared";

/** The narrowest stored copy: a thumbnail, never the 1600px page. */
function thumbnailPath(image: EditorImage): string {
  return image.renditions[0]?.path ?? image.path;
}

/**
 * The pages of one issue, in reading order (#1472).
 *
 * Reordering has two ways in: drag, for a mouse, and the up/down buttons,
 * which are the keyboard's and a screen reader's -- a drag-only list is one
 * WCAG 2.5.7 rules out. Both edit the same list the Save button sends.
 */
export function PageList({
  pages,
  onChange,
  onAddFiles,
  uploading,
  canEdit,
}: {
  pages: readonly EditorPage[];
  onChange: (pages: EditorPage[]) => void;
  onAddFiles: (files: File[]) => void;
  /** "Uploading 3 of 24…", or null when idle. */
  uploading: string | null;
  canEdit: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function update(index: number, patch: Partial<EditorPage>) {
    onChange(
      pages.map((page, i) => (i === index ? { ...page, ...patch } : page)),
    );
  }

  function move(from: number, to: number) {
    onChange(moveItem(pages, from, to));
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) onAddFiles(files);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading !== null}
            onClick={() => input.current?.click()}
          >
            {uploading ? <Spinner /> : <ImagePlus />}
            Add pages
          </Button>
          <GoogleDriveButton
            accept="image/jpeg,image/png"
            multiple
            disabled={uploading !== null}
            onFiles={onAddFiles}
          />
          <span className="app-muted text-xs" aria-live="polite">
            {uploading ??
              "JPEG or PNG scans, several at once. They are added in filename order and resized for the web before they upload."}
          </span>
        </div>
      )}

      {pages.length === 0 ? (
        <p className="app-muted text-sm italic">
          No pages yet. An issue needs at least one before it can be published.
        </p>
      ) : (
        <ol className="space-y-3">
          {pages.map((page, index) => {
            const number = index + 1;
            const complete = pageHasText(page);
            return (
              <li
                key={page.key}
                draggable={canEdit}
                onDragStart={(event) => {
                  setDragging(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (dragging === null) return;
                  event.preventDefault();
                  setOver(index);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null) move(dragging, index);
                  setDragging(null);
                  setOver(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border border-[var(--line)] p-3 sm:flex-row",
                  over === index && dragging !== index && "border-primary",
                  dragging === index && "opacity-60",
                )}
              >
                <div className="flex shrink-0 items-start gap-2 sm:flex-col">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a stored 480px thumbnail, served straight from the bucket */}
                  <img
                    src={publicationFileUrl(thumbnailPath(page.image))}
                    alt=""
                    width={page.image.width}
                    height={page.image.height}
                    loading="lazy"
                    className="h-auto w-24 rounded border border-[var(--line)] bg-muted"
                  />
                  {canEdit && (
                    <div className="flex items-center gap-1 sm:w-24 sm:justify-between">
                      <GripVertical
                        className="app-muted hidden size-4 cursor-grab sm:block"
                        aria-hidden="true"
                      />
                      <TooltipIconButton
                        label={`Move page ${number} up`}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                      >
                        <ArrowUp />
                      </TooltipIconButton>
                      <TooltipIconButton
                        label={`Move page ${number} down`}
                        disabled={index === pages.length - 1}
                        onClick={() => move(index, index + 1)}
                      >
                        <ArrowDown />
                      </TooltipIconButton>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      Page {number}
                      {complete ? (
                        <CheckCircle2
                          className="size-4 text-success"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertCircle
                          className="size-4 text-warning"
                          aria-hidden="true"
                        />
                      )}
                      <span className="sr-only">
                        {complete
                          ? "has alt text and a transcript"
                          : "needs alt text and a transcript"}
                      </span>
                    </p>
                    {canEdit && (
                      <ConfirmDeleteButton
                        label={`Remove page ${number}`}
                        title={`Remove page ${number}?`}
                        description="The page leaves this issue when you save. Its image is deleted from storage a day later."
                        confirmLabel="Remove"
                        onConfirm={() =>
                          onChange(pages.filter((_, i) => i !== index))
                        }
                      />
                    )}
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`page-${page.key}-alt`}>
                      Alt text
                    </FieldLabel>
                    <Input
                      id={`page-${page.key}-alt`}
                      value={page.altText}
                      placeholder={`Page ${number}: comic about the first snow day`}
                      readOnly={!canEdit}
                      onChange={(event) =>
                        update(index, { altText: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`page-${page.key}-transcript`}>
                      Transcript
                    </FieldLabel>
                    <MarkdownTextarea
                      id={`page-${page.key}-transcript`}
                      value={page.transcript}
                      rows={4}
                      className="max-h-60"
                      placeholder="Every word on the page, handwriting and lettering included."
                      readOnly={!canEdit}
                      onChange={(event) =>
                        update(index, { transcript: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
