import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadStorySource } from "@/lib/social-content/story-data";
import { renderStoryFrame } from "@/lib/social-content/story-render";
import { parseStoryFrame } from "@/lib/social-content/story-frames";
import { POST_TEMPLATES } from "@/lib/social-content/post-templates";

/**
 * One frame of a post's story, as a 1080x1920 PNG (#1908), drawn by the
 * post's template (#1924). Gear Spotlight's: 1 the item, 2 its details, 3 how
 * to get it.
 *
 * Under `/api/` so the portal host's proxy passes it through rather than
 * rewriting it into `/portal/*`, like `/api/app-icon/[size]`. Nothing here is
 * public: it answers only a signed-in user who can open the post, and 404s a
 * post that features no item or whose template the tenant switched off.
 *
 * `?text=` is the post page's live preview (#1925): the template's fields as
 * typed, as a JSON object, drawn in place of the saved text. It is checked
 * against the same caps as a save and is never stored -- the preview is this
 * response and nothing else. `?download=1` answers as an attachment for
 * Download PNG.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ pieceId: string; frame: string }> },
) {
  const { pieceId, frame: rawFrame } = await context.params;
  const frame = parseStoryFrame(rawFrame);
  if (!frame) return new Response("Not found", { status: 404 });

  const params = new URL(request.url).searchParams;
  const overrides = parseOverrides(params.get("text"));
  if (overrides === "invalid") {
    return new Response("Bad preview text", { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const load = await loadStorySource(
    supabase,
    createSupabaseAdminClient(),
    pieceId,
    overrides ?? undefined,
  );
  if (load.status === "unauthenticated") {
    return new Response("Sign in to view this image", { status: 401 });
  }
  if (load.status === "not_found") {
    return new Response("Not found", { status: 404 });
  }
  if (load.status === "invalid") {
    return new Response(load.error, { status: 400 });
  }

  // A frame the post's template doesn't have is a miss like any other.
  if (!POST_TEMPLATES[load.source.templateKey].frames.includes(frame)) {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    // The post's own data, behind a session: never a shared cache.
    "Cache-Control": "private, no-store",
  };
  if (params.get("download") === "1") {
    headers["Content-Disposition"] =
      `attachment; filename="${load.source.templateKey.replace(/_/g, "-")}-${frame}.png"`;
  }
  return renderStoryFrame(load.source, frame, request.url, headers);
}

/** Preview text is a few short fields; anything longer isn't one. */
const MAX_PREVIEW_PARAM = 4_000;

function parseOverrides(
  raw: string | null,
): { text: Record<string, unknown> } | null | "invalid" {
  if (raw === null) return null;
  if (raw.length > MAX_PREVIEW_PARAM) return "invalid";
  try {
    const text: unknown = JSON.parse(raw);
    if (!text || typeof text !== "object" || Array.isArray(text)) {
      return "invalid";
    }
    return { text: text as Record<string, unknown> };
  } catch {
    return "invalid";
  }
}
