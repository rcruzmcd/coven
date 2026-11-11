import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compressImage } from "./compress-image";

/**
 * The private `documents` bucket created by 20260930120000 (#1489).
 *
 * No public URL exists for anything in it. The portal reads an object through
 * a short-lived signed URL minted server-side (`documents-sign.ts`), and the
 * bucket's policies decide per module who may resolve one.
 */
export const DOCUMENTS_BUCKET = "documents";

/**
 * The folder under the tenant prefix, one per module whose policies govern it:
 * `governance` (#1489) and finance `receipts` (#1490).
 */
export type DocumentModule = "governance" | "receipts";

/** Matching the bucket's own `file_size_limit`. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Longest edge of a photographed page: legible, and a few hundred KB. */
export const DOCUMENT_IMAGE_MAX_EDGE = 2000;

const PDF = "application/pdf";

/** What a picked document field accepts, from the device or from Drive. */
export const DOCUMENT_ACCEPT = `${PDF},image/*`;

/** The refusal for a file over `DOCUMENT_MAX_BYTES`, wherever it came from. */
export function documentTooLargeMessage(name: string): string {
  return `${name} is larger than 10 MB. Link it instead.`;
}

export type DocumentKind = "pdf" | "image";

/**
 * What a picked file will be stored as, or why it can't be.
 *
 * Any image the browser can decode is accepted, HEIC included, because it is
 * re-encoded to JPEG before upload; a PDF is stored as picked. Advisory only --
 * the bucket's `allowed_mime_types` and `file_size_limit` are what refuse.
 */
export function checkDocumentFile(
  file: Pick<File, "name" | "type" | "size">,
): { kind: DocumentKind } | { error: string } {
  if (file.type === PDF) {
    if (file.size > DOCUMENT_MAX_BYTES) {
      return { error: documentTooLargeMessage(file.name) };
    }
    return { kind: "pdf" };
  }
  if (file.type.startsWith("image/")) return { kind: "image" };
  return { error: `${file.name} is not a PDF or an image.` };
}

/**
 * A file name safe to use as the last segment of an object path, with the
 * extension of what will actually be stored.
 *
 * Storage keys refuse some characters outright and URL-encode the rest, so
 * anything outside a conservative set becomes a hyphen. The name is kept at
 * all because it is what the portal shows for the file afterwards.
 */
export function documentFileName(name: string, kind: DocumentKind): string {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${stem || "document"}.${kind === "pdf" ? "pdf" : "jpg"}`;
}

/** The file name a stored path was given: its last segment. */
export function documentNameFromPath(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Whether a stored path is an image, which is what earns it a thumbnail. */
export function isImageDocument(path: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(path);
}

/**
 * The shape `createDocumentPathAction` mints and every document form accepts:
 * `{tenant uuid}/{module}/{upload uuid}/{file name}`. The database's
 * `*_path_in_tenant` constraints check the tenant; this rejects
 * anything that isn't a path at all before it gets that far.
 */
export function isDocumentPath(path: string, module: DocumentModule): boolean {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return new RegExp(`^${uuid}/${module}/${uuid}/[A-Za-z0-9._-]+$`).test(path);
}

export type DocumentUploadResult =
  { path: string; bytes: number } | { error: string };

/**
 * Uploads one picked file to `path`, re-encoding an image first.
 *
 * Never throws: the caller is a form field mid-entry, so every failure comes
 * back as a sentence. `path` comes from `createDocumentPathAction()`.
 */
export async function uploadDocument(
  file: File,
  kind: DocumentKind,
  path: string,
): Promise<DocumentUploadResult> {
  let body: Blob = file;
  if (kind === "image") {
    try {
      body = await compressImage(file, DOCUMENT_IMAGE_MAX_EDGE);
    } catch (error) {
      console.error("Could not read the selected image", error);
      return {
        error: `${file.name} could not be read as an image. Try a PDF, or paste a link instead.`,
      };
    }
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, body, {
      contentType: kind === "pdf" ? PDF : "image/jpeg",
      upsert: false,
    });

  if (error) {
    console.error("Could not upload the document", error);
    const status = String(
      (error as { statusCode?: string | number }).statusCode,
    );
    if (status === "413") return { error: "That file is too large." };
    if (status === "403") {
      return { error: "You don't have permission to upload documents here." };
    }
    return { error: "The file could not be uploaded. Try again." };
  }

  return { path, bytes: body.size };
}

/**
 * Best-effort removal of an object this editing session uploaded and then
 * replaced or removed. Swallows its error: the daily purge
 * (`documents-purge.ts`) collects anything left behind, and a persisted path
 * is never passed here -- it may still be the saved record's document.
 */
export async function deleteDocument(path: string): Promise<void> {
  try {
    const { error } = await createSupabaseBrowserClient()
      .storage.from(DOCUMENTS_BUCKET)
      .remove([path]);
    if (error) console.error("Could not remove the discarded document", error);
  } catch (error) {
    console.error("Could not remove the discarded document", error);
  }
}
