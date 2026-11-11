"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FileUp,
  ImagePlus,
  Lock,
  Save,
  Upload,
  X,
} from "lucide-react";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { StatusBadge } from "@/components/portal/status-badge";
import { useActionToast } from "@/components/portal/action-toast";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import {
  PUBLICATION_PDF_MAX_BYTES,
  PUBLICATION_SLUG_MAX,
  byFileName,
  formatFileSize,
  pagesMissingText,
  publicationSlugify,
  suggestPublicationSlug,
} from "@/lib/publications";
import {
  publicationFileUrl,
  uploadPublicationImage,
  uploadPublicationPdf,
  type UploadResult,
} from "@/lib/storage/publication-files";
import {
  deletePublicationAction,
  savePublicationAction,
  setPublicationStatusAction,
} from "../actions";
import {
  PUBLICATIONS_PATH,
  type EditorFile,
  type EditorIssue,
  type EditorPage,
  type IssueDetails,
} from "../publication-shared";
import { PageList } from "./page-list";

function detailsOf(issue: EditorIssue): IssueDetails {
  const { id, status, publishedAt, updatedAt, ...details } = issue;
  void id;
  void status;
  void publishedAt;
  void updatedAt;
  return details;
}

function signature(details: IssueDetails, pages: readonly EditorPage[]) {
  return JSON.stringify([details, pages]);
}

function failed<T extends object>(
  result: UploadResult<T>,
): result is { error: string } {
  return "error" in result;
}

/**
 * One issue's editor (#1472): its details, its pages in order with each one's
 * alt text and transcript, its optional PDFs, and publishing.
 *
 * Files upload the moment they are picked, into this issue's folder, and the
 * rows are written only on Save -- so an abandoned upload is an object nothing
 * references, which the daily orphan purge removes. Publishing moves only
 * what is saved, and the database refuses it while any page lacks its text.
 */
export function IssueEditor({
  issue,
  pages: initialPages,
  folder,
  canEdit,
}: {
  issue: EditorIssue;
  pages: readonly EditorPage[];
  /** `{tenant_id}/{publication_id}`, the prefix the bucket's policies admit. */
  folder: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  const [details, setDetails] = useState<IssueDetails>(() => detailsOf(issue));
  const [pages, setPages] = useState<EditorPage[]>(() => [...initialPages]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const dirty =
    signature(details, pages) !== signature(detailsOf(issue), initialPages);
  const guard = useUnsavedChangesGuard(canEdit && dirty);
  const busy = isPending || uploading !== null;
  const published = issue.status === "published";
  const slugLocked = issue.publishedAt !== null;
  const missing = pagesMissingText(pages);
  const suggestion = suggestPublicationSlug(
    details.seasonLabel,
    details.publishDate,
  );
  const publicHref = `/publications/${issue.slug}`;

  function set<K extends keyof IssueDetails>(key: K, value: IssueDetails[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  async function addPages(files: File[]) {
    const ordered = byFileName(files);
    const added: EditorPage[] = [];
    for (const [index, file] of ordered.entries()) {
      setUploading(`Uploading ${index + 1} of ${ordered.length}…`);
      const result = await uploadPublicationImage(file, folder);
      if (failed(result)) {
        toast.error(result.error);
        continue;
      }
      added.push({
        key: crypto.randomUUID(),
        image: result,
        altText: "",
        transcript: "",
      });
    }
    setUploading(null);
    if (added.length) {
      setPages((current) => [...current, ...added]);
      toast.success(
        `${added.length} ${added.length === 1 ? "page" : "pages"} added. Save to keep them.`,
      );
    }
  }

  async function replaceCover(file: File) {
    setUploading("Uploading the cover…");
    const result = await uploadPublicationImage(file, folder);
    setUploading(null);
    if (failed(result)) {
      toast.error(result.error);
      return;
    }
    set("cover", result);
  }

  async function replacePdf(key: "readingPdf" | "printPdf", file: File) {
    setUploading("Uploading the PDF…");
    const result = await uploadPublicationPdf(file, folder);
    setUploading(null);
    if (failed(result)) {
      toast.error(result.error);
      return;
    }
    set(key, result);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => savePublicationAction(issue.id, details, pages), {
      success: `${details.title} saved.`,
      description: published
        ? "The public page shows the change now."
        : "It is still a draft. Publish it to put it on the site.",
      onSuccess: () => router.refresh(),
    });
  }

  function setStatus(status: "draft" | "published") {
    run(() => setPublicationStatusAction(issue.id, status), {
      success:
        status === "published"
          ? `${details.title} published.`
          : `${details.title} is a draft again.`,
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <>
      <PortalBreadcrumbs
        current={details.title || issue.slug}
        onNavigate={(href, event) => {
          if (guard.allowOpenChange(false)) return;
          event.preventDefault();
          setPendingHref(href);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="brand-display min-w-0 text-3xl font-semibold tracking-brand break-words sm:text-4xl">
          {details.title || issue.slug}
        </h1>
        <StatusBadge tone={published ? "success" : "neutral"}>
          {published ? "Published" : "Draft"}
        </StatusBadge>
      </div>

      <Card className="mt-6 max-w-3xl">
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">
            {published ? (
              <>
                Published
                {issue.publishedAt
                  ? ` ${formatDateTime(issue.publishedAt)}`
                  : ""}
                . Saving changes it on the public site straight away.
              </>
            ) : (
              <>
                A draft: only people who can edit publications see it, at its
                public address, until you publish it.
              </>
            )}
          </p>
          {pages.length === 0 ? (
            <p className="app-muted text-sm">
              Add at least one page before publishing.
            </p>
          ) : missing > 0 ? (
            <p className="text-sm text-warning" role="status">
              {missing} of {pages.length}{" "}
              {pages.length === 1 ? "page" : "pages"} still{" "}
              {missing === 1 ? "needs" : "need"} alt text or a transcript. Every
              page needs both before the issue can be published.
            </p>
          ) : (
            <p className="app-muted text-sm" role="status">
              Every page has alt text and a transcript.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit &&
              (published ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setStatus("draft")}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || dirty || pages.length === 0 || missing > 0}
                  onClick={() => setStatus("published")}
                >
                  {isPending && <Spinner />}
                  Publish
                </Button>
              ))}
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={publicHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              {published ? "View on the site" : "Preview"}
              <ExternalLink className="size-3" />
            </Button>
            {canEdit && dirty && !published && (
              <span className="app-muted text-xs">
                Save before publishing — publishing only moves what is saved.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <form className="mt-6 max-w-3xl space-y-6" onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor="issue-title" required>
                Title
              </FieldLabel>
              <Input
                id="issue-title"
                value={details.title}
                required
                readOnly={!canEdit}
                onChange={(event) => set("title", event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="issue-season">Season</FieldLabel>
                <Input
                  id="issue-season"
                  value={details.seasonLabel}
                  placeholder="Fall 2026"
                  readOnly={!canEdit}
                  onChange={(event) => set("seasonLabel", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="issue-date">Publish date</FieldLabel>
                <Input
                  id="issue-date"
                  type="date"
                  value={details.publishDate}
                  readOnly={!canEdit}
                  onChange={(event) => set("publishDate", event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="issue-slug" required>
                Web address
              </FieldLabel>
              <Input
                id="issue-slug"
                value={details.slug}
                required
                maxLength={PUBLICATION_SLUG_MAX}
                readOnly={!canEdit || slugLocked}
                aria-describedby="issue-slug-note"
                onChange={(event) =>
                  set("slug", publicationSlugify(event.target.value))
                }
              />
              <FieldDescription id="issue-slug-note">
                {slugLocked ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3" aria-hidden="true" />
                    Locked: this issue has been published, and printed copies
                    and QR codes carry /publications/{details.slug}.
                  </span>
                ) : (
                  <>
                    /publications/{details.slug || "…"}. It locks the first time
                    the issue is published.
                    {canEdit && suggestion && suggestion !== details.slug && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="underline underline-offset-4"
                          onClick={() => set("slug", suggestion)}
                        >
                          Use {suggestion}
                        </button>
                      </>
                    )}
                  </>
                )}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="issue-blurb">Blurb</FieldLabel>
              <Textarea
                id="issue-blurb"
                value={details.blurb}
                rows={3}
                readOnly={!canEdit}
                onChange={(event) => set("blurb", event.target.value)}
              />
              <FieldDescription>
                A sentence or two under the title, and on the issue&apos;s card.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Cover</FieldLabel>
              <div className="flex flex-wrap items-start gap-4">
                {details.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a stored thumbnail, served straight from the bucket
                  <img
                    src={publicationFileUrl(
                      details.cover.renditions[0]?.path ?? details.cover.path,
                    )}
                    alt="The current cover"
                    width={details.cover.width}
                    height={details.cover.height}
                    className="h-auto w-28 rounded border border-[var(--line)] bg-muted"
                  />
                ) : (
                  <p className="app-muted text-sm">
                    No cover. The issue&apos;s card shows its title instead.
                  </p>
                )}
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={coverInput}
                      type="file"
                      accept="image/jpeg,image/png"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void replaceCover(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => coverInput.current?.click()}
                    >
                      <ImagePlus />
                      {details.cover ? "Replace cover" : "Upload cover"}
                    </Button>
                    <GoogleDriveButton
                      accept="image/jpeg,image/png"
                      disabled={busy}
                      onFiles={([picked]) => void replaceCover(picked)}
                    />
                    {pages[0] &&
                      details.cover?.path !== pages[0].image.path && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => set("cover", pages[0].image)}
                        >
                          Use page 1
                        </Button>
                      )}
                    {details.cover && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => set("cover", null)}
                      >
                        <X />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pages</CardTitle>
            <CardDescription>
              Read top to bottom on the public page. Alt text is a short
              description of the page; the transcript is every word on it, for
              screen readers and search.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PageList
              pages={pages}
              onChange={setPages}
              onAddFiles={(files) => void addPages(files)}
              uploading={uploading}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <CardDescription>
              Optional downloads beside the pages, never instead of them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <PdfField
              id="reading-pdf"
              label="Reading PDF"
              description="The pages in reading order, offered as “Download PDF”."
              file={details.readingPdf}
              canEdit={canEdit}
              busy={busy}
              onPick={(file) => void replacePdf("readingPdf", file)}
              onRemove={() => set("readingPdf", null)}
            />
            <PdfField
              id="print-pdf"
              label="Print PDF"
              description={
                <>
                  A print-ready, possibly imposed file, offered as “Print at
                  home” with the folding instructions from{" "}
                  <Link
                    href="/portal/website?page=publications"
                    className="underline underline-offset-4"
                  >
                    Pages
                  </Link>
                  .
                </>
              }
              file={details.printPdf}
              canEdit={canEdit}
              busy={busy}
              onPick={(file) => void replacePdf("printPdf", file)}
              onRemove={() => set("printPdf", null)}
            />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-background/95 px-2 py-3 backdrop-blur">
            <Button type="submit" disabled={busy || !dirty}>
              {isPending ? <Spinner /> : <Save />}
              Save
            </Button>
            <span className="app-muted text-xs" aria-live="polite">
              {uploading ?? (dirty ? "Unsaved changes." : "All changes saved.")}
            </span>
          </div>
        )}
      </form>

      {canEdit && (
        <div className="mt-10 max-w-3xl border-t border-[var(--line)] pt-6">
          {published ? (
            <Alert>
              <AlertDescription>
                Unpublish this issue before deleting it.
              </AlertDescription>
            </Alert>
          ) : (
            <ConfirmDeleteButton
              label={`Delete ${details.title || issue.slug}`}
              title={`Delete ${details.title || issue.slug}?`}
              description="The issue, its pages, transcripts and files are deleted. This can't be undone."
              pending={isPending}
              onConfirm={() =>
                run(() => deletePublicationAction(issue.id), {
                  success: `${details.title || issue.slug} deleted.`,
                  onSuccess: () => router.push(PUBLICATIONS_PATH),
                })
              }
            />
          )}
        </div>
      )}

      <DiscardChangesDialog
        guard={guard}
        subject="this issue"
        onDiscard={() => router.push(pendingHref ?? PUBLICATIONS_PATH)}
      />
    </>
  );
}

function PdfField({
  id,
  label,
  description,
  file,
  canEdit,
  busy,
  onPick,
  onRemove,
}: {
  id: string;
  label: string;
  description: React.ReactNode;
  file: EditorFile | null;
  canEdit: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field>
      <FieldLabel htmlFor={`${id}-pick`}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-wrap items-center gap-2">
        {file ? (
          <a
            href={publicationFileUrl(file.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
          >
            <FileUp className="size-3.5" aria-hidden="true" />
            PDF, {formatFileSize(file.bytes)}
          </a>
        ) : (
          <span className="app-muted text-sm">None.</span>
        )}
        {canEdit && (
          <>
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) onPick(picked);
              }}
            />
            <Button
              id={`${id}-pick`}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload />
              {file ? "Replace" : "Upload"}
            </Button>
            {/* A Google Doc or Slides deck comes back exported as a PDF. */}
            <GoogleDriveButton
              accept="application/pdf"
              maxBytes={PUBLICATION_PDF_MAX_BYTES}
              disabled={busy}
              onFiles={([picked]) => onPick(picked)}
            />
            {file && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onRemove}
              >
                <X />
                Remove
              </Button>
            )}
          </>
        )}
      </div>
    </Field>
  );
}
