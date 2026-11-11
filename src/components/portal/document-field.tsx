"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { GoogleDriveButton } from "@/components/portal/google-drive-button";
import { formatFileSize } from "@/lib/publications";
import {
  checkDocumentFile,
  deleteDocument,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  documentTooLargeMessage,
  documentNameFromPath,
  isImageDocument,
  uploadDocument,
  type DocumentModule,
} from "@/lib/storage/documents";
import { createDocumentPathAction } from "@/app/portal/(app)/document-actions";

/** A record's document: a pasted link, an uploaded object path, or neither. */
export type DocumentValue = { link: string; path: string };

function hostOf(link: string): string {
  try {
    return new URL(link).host || link;
  } catch {
    return link;
  }
}

/**
 * `value` if it is safe to put in an `href` or `src`: http(s) for a pasted
 * link or a signed URL, blob: for a file picked a moment ago. Anything else
 * -- a stored `javascript:` link above all -- is shown but never made live.
 */
export function safeDocumentUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:" || protocol === "blob:"
      ? value
      : null;
  } catch {
    return null;
  }
}

function OpenButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <ExternalLink />
      Open
    </a>
  );
}

/**
 * How a record's document reads (#1489): a thumbnail for an uploaded image, a
 * file row with Open for a PDF, and the host with Open for a link. Shared by
 * each record's read view and by `DocumentField` after an upload.
 *
 * `url` is the signed URL a server page minted for `path`, or a local object
 * URL straight after an upload. Null for a path means it could not be signed
 * -- a missing object, or a reader the bucket refused -- and the file is named
 * without a way to open it rather than breaking the view.
 */
export function DocumentPreview({
  link,
  path,
  url,
  bytes,
}: {
  link: string | null;
  path: string | null;
  url: string | null;
  bytes?: number | null;
}) {
  const href = safeDocumentUrl(path ? url : link);
  if (path) {
    const name = documentNameFromPath(path);
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2">
        {href && isImageDocument(path) ? (
          // A signed URL whose token rotates hourly, or a blob: URL: next/image
          // would cache a key that is stale by the next render.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={href}
            alt=""
            className="size-14 shrink-0 rounded-md bg-muted object-cover"
          />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          <p className="app-muted text-xs">
            {href
              ? bytes
                ? formatFileSize(bytes)
                : "Uploaded file"
              : "This file could not be loaded."}
          </p>
        </div>
        {href && <OpenButton href={href} label={`Open ${name}`} />}
      </div>
    );
  }

  if (link) {
    const host = hostOf(link);
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
          <Link2 className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={link}>
          {host}
        </p>
        {href && <OpenButton href={href} label={`Open link on ${host}`} />}
      </div>
    );
  }

  return <>—</>;
}

type LocalFile = { path: string; bytes: number; objectUrl: string };

/**
 * A record's document, as a link **or** an uploaded file (#1489).
 *
 * The upload happens on file select, like `PhotoUploadField`, so the preview
 * is real before Save; a file replaced, removed or abandoned is collected by
 * the daily purge (`documents-purge.ts`). Only a path uploaded in this editing
 * session is ever deleted here -- the persisted one is still the saved
 * record's document until Save says otherwise.
 *
 * No `capture` attribute on the file input, for `PhotoUploadField`'s reason:
 * it would take away the library and files options, while `image/*` in
 * `accept` already offers the camera on a phone for a photo of paper.
 */
export function DocumentField({
  value,
  onChange,
  signedUrl,
  idPrefix,
  module,
  label = "Document",
  description = "A PDF or a photo of the page, up to 10 MB, or a link to one.",
  disabled = false,
}: {
  value: DocumentValue;
  onChange: (value: DocumentValue) => void;
  /** The signed URL for the record's persisted `path`, if it has one. */
  signedUrl: string | null;
  idPrefix: string;
  module: DocumentModule;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalFile | null>(null);
  const uploadedPaths = useRef<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  // Object URLs hold the picked file in memory until revoked.
  useEffect(() => {
    return () => {
      if (local) URL.revokeObjectURL(local.objectUrl);
    };
  }, [local]);

  function discard(path: string) {
    if (uploadedPaths.current.has(path)) {
      uploadedPaths.current.delete(path);
      void deleteDocument(path);
    }
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // So picking the same file twice in a row still fires a change event.
    event.target.value = "";
    if (file) void uploadFile(file);
  }

  async function uploadFile(file: File) {
    setError(null);
    const checked = checkDocumentFile(file);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }

    setUploading(true);
    try {
      const minted = await createDocumentPathAction(
        module,
        file.name,
        checked.kind,
      );
      if ("error" in minted) {
        setError(minted.error);
        return;
      }
      const result = await uploadDocument(file, checked.kind, minted.path);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      uploadedPaths.current.add(result.path);
      if (value.path) discard(value.path);
      setLocal({
        path: result.path,
        bytes: result.bytes,
        objectUrl: URL.createObjectURL(file),
      });
      onChange({ link: "", path: result.path });
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (value.path) discard(value.path);
    setLocal(null);
    setError(null);
    onChange({ link: "", path: "" });
  }

  const fresh = local && local.path === value.path ? local : null;
  const fileId = `${idPrefix}-document-file`;
  const linkId = `${idPrefix}-document-link`;

  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">{label}</FieldLegend>

      {value.path ? (
        <>
          <DocumentPreview
            link={null}
            path={value.path}
            url={fresh ? fresh.objectUrl : signedUrl}
            bytes={fresh?.bytes}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? <Spinner /> : null}
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || uploading}
              onClick={handleRemove}
            >
              Remove
            </Button>
          </div>
        </>
      ) : (
        <>
          <FieldLabel htmlFor={linkId} className="font-normal">
            Link
          </FieldLabel>
          <Input
            id={linkId}
            type="url"
            placeholder="https://..."
            value={value.link}
            disabled={disabled || uploading}
            onChange={(event) => {
              setError(null);
              onChange({ link: event.target.value, path: "" });
            }}
          />
          {value.link && /^https?:\/\/\S+$/i.test(value.link.trim()) ? (
            <DocumentPreview link={value.link.trim()} path={null} url={null} />
          ) : null}
          <FieldLabel htmlFor={fileId} className="font-normal">
            Or upload a file
          </FieldLabel>
        </>
      )}

      <div
        className={value.path ? "hidden" : "flex flex-wrap items-center gap-2"}
      >
        {/*
          A visible native file input, as in PhotoUploadField: one tab stop, a
          real <label>, and nothing for axe's aria-hidden-focus rule to catch.
          With a file attached it is hidden entirely and Replace drives it.
        */}
        <input
          ref={fileInput}
          id={fileId}
          type="file"
          accept={DOCUMENT_ACCEPT}
          disabled={disabled || uploading}
          onChange={handleFile}
          aria-describedby={`${idPrefix}-document-help`}
          className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {uploading && !value.path && <Spinner aria-label="Uploading file" />}
      </div>

      <GoogleDriveButton
        accept={DOCUMENT_ACCEPT}
        maxBytes={DOCUMENT_MAX_BYTES}
        tooLarge={documentTooLargeMessage}
        disabled={disabled || uploading}
        onFiles={([file]) => void uploadFile(file)}
      />

      <FieldDescription id={`${idPrefix}-document-help`}>
        {description}
      </FieldDescription>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </FieldSet>
  );
}
