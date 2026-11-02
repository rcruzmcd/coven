"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { getClientIp } from "@/lib/get-client-ip";
import { notifyNewArtworkSubmission } from "@/lib/notifications/submission-notifications";
import {
  ALLOWED_IMAGE_TYPES,
  ARTWORK_BUCKET,
  extensionForType,
  type ArtworkUploadSlot,
} from "@/lib/storage/artwork-submissions";
import { rpcErrorCode } from "@/lib/analytics/error-code";
import { parseArtworkForm } from "./artwork-form";

export type ArtworkUploadSlotsResult =
  { error: string } | { slots: ArtworkUploadSlot[] };

/** `code` is the RPC's refusal, for the funnel (#1713); absent where the form parser refused. */
export type SubmitArtworkResult =
  { error: string; code?: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
  CALL_CLOSED: "This call for artwork is closed.",
  TOO_MANY_IMAGES: "That is more images than this call accepts.",
  IMAGES_REQUIRED: "Add at least one image of your work.",
  INVALID_IMAGE_PATH:
    "Something went wrong with your images. Please remove them and add them again.",
  NAME_REQUIRED: "Your name is required.",
  INVALID_EMAIL: "A valid email is required.",
  CONSENT_REQUIRED:
    "Please confirm the work is yours and that you agree to the terms above.",
  INVALID_PORTFOLIO_URL:
    "A portfolio link has to start with http:// or https://.",
};

function messageFor(rpcError: string, fallback: string): string {
  return ERROR_MESSAGES[rpcError] ?? fallback;
}

/**
 * Mints one-shot signed upload URLs, one pair per picked file.
 *
 * This is the only reason the public site touches the service-role client, and
 * it exists because there is no safe alternative. A 10 MB image cannot be
 * posted through a Server Action — Next caps the body at 1 MB by default and
 * Vercel at 4.5 MB — and an `anon` insert policy on `storage.objects` would be
 * an unauthenticated write faucet on the same project as production. So the
 * browser uploads directly, to a path this action chooses, with a token that
 * works once.
 *
 * `claim_artwork_upload_slots` runs first and does the load-bearing work: the
 * rate limit, the open-call check, and resolving the tenant from the request
 * host. Nothing the caller sent reaches a path — the tenant and call ids come
 * back from the RPC, and the two uuid segments are minted here.
 */
export async function createArtworkUploadSlotsAction(
  code: string,
  contentTypes: string[],
): Promise<ArtworkUploadSlotsResult> {
  if (contentTypes.length === 0) return { slots: [] };
  if (
    contentTypes.some(
      (type) => !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type),
    )
  ) {
    return { error: "Images must be JPEG, PNG or WebP." };
  }

  const ipAddress = await getClientIp();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .rpc("claim_artwork_upload_slots", {
      p_code: code,
      p_count: contentTypes.length,
      p_ip_address: ipAddress,
    })
    .maybeSingle();

  if (error) {
    return {
      error: messageFor(
        error.message,
        "Uploads aren't available right now. Please try again.",
      ),
    };
  }
  if (!data) return { error: ERROR_MESSAGES.CALL_CLOSED };

  const claim = data as { tenant_id: string; call_id: string };
  const admin = createSupabaseAdminClient();
  // One folder per batch of picked files, so a path can never collide with
  // another submitter's and the purge job has a natural unit to sweep.
  const draftId = crypto.randomUUID();
  const slots: ArtworkUploadSlot[] = [];

  for (const contentType of contentTypes) {
    const imageId = crypto.randomUUID();
    const prefix = `${claim.tenant_id}/${claim.call_id}/${draftId}/${imageId}`;
    const path = `${prefix}.${extensionForType(contentType)}`;
    const thumbPath = `${prefix}-thumb.jpg`;

    const original = await admin.storage
      .from(ARTWORK_BUCKET)
      .createSignedUploadUrl(path);
    const thumb = await admin.storage
      .from(ARTWORK_BUCKET)
      .createSignedUploadUrl(thumbPath);

    if (original.error || thumb.error) {
      console.error(
        "Could not mint an artwork upload slot",
        original.error ?? thumb.error,
      );
      return { error: "Uploads aren't available right now. Please try again." };
    }

    slots.push({
      path,
      token: original.data.token,
      thumbPath,
      thumbToken: thumb.data.token,
    });
  }

  return { slots };
}

/**
 * Public, unauthenticated: anyone holding the call's code may submit.
 *
 * Validation, the honeypot, the rate limit, the open-call check and the shape
 * of every image path are all re-enforced inside `submit_artwork`, since `anon`
 * has no grant on any of the three tables.
 */
export async function submitArtworkAction(
  code: string,
  formData: FormData,
): Promise<SubmitArtworkResult> {
  const parsed = parseArtworkForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("submit_artwork", {
    p_code: code,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_title: parsed.data.title,
    p_medium: parsed.data.medium,
    p_statement: parsed.data.statement,
    p_images: parsed.data.images,
    p_credit_name: parsed.data.creditName,
    p_portfolio_url: parsed.data.portfolio,
    p_consent: parsed.data.consent,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
  });

  if (error) {
    return {
      error: messageFor(
        error.message,
        "Could not send your submission. Please try again.",
      ),
      code: rpcErrorCode(error.message),
    };
  }

  // After the response, never before it (#742): telling the curators is the
  // organization's business, and a slow mail provider must not hold up
  // "thanks, we got it". Read the origin here — after() may run once the
  // request's headers are gone (#860).
  const siteUrl = await getRequestOrigin();

  after(async () => {
    await notifyNewArtworkSubmission(createSupabaseAdminClient(), {
      submissionId: data as string,
      siteUrl,
    });
  });

  return { success: true };
}
