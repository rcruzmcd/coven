"use server";

import { revalidatePath } from "next/cache";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadEventTemplateRecord } from "./event-post-data";
import {
  GEAR_SPOTLIGHT,
  POST_TEMPLATES,
  isEventTemplateKey,
  normalizeTemplateText,
  parseTemplateText,
  postTemplate,
  templatesFor,
} from "./post-templates";
import { postRecordKinds } from "./post-template-editor";
import { updateGearDetailsAction } from "./series-gear-actions";
import { loadPostTemplatesOff } from "./story-data";

/**
 * The post page's template card (#1925): what a post is drawn with, and the
 * words and photo it is drawn from. Editing takes content_calendar manage,
 * the post form's own check; RLS on content_opportunities says the same.
 */

const MESSAGES = {
  NOT_FOUND: "This post no longer exists.",
  PUBLISHED: "This post is published, so it can't be changed.",
  NO_TEMPLATE: "This post isn't drawn with a template.",
  OFF: "This template is switched off for your organization.",
  DOESNT_FIT: "That template doesn't fit this post.",
};

async function authorize() {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change a post.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase };
}

function revalidateSocial() {
  revalidatePath("/portal/social", "layout");
  revalidatePath("/portal/calendar");
}

/**
 * Saves the template's fields as typed. Only what differs from the record is
 * stored (`normalizeTemplateText`), so Reset is saving the record's value.
 */
export async function savePostTemplateTextAction(
  postId: string,
  input: Record<string, string>,
): Promise<{ error: string } | { success: true; captionUpdated: boolean }> {
  const auth = await authorize();
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { data: post } = await supabase
    .from("content_opportunities")
    .select(
      "id, tenant_id, event_id, content_status, template_key, template_text, series:social_post_series!content_opportunities_series_id_fkey(content_source)",
    )
    .eq("id", String(postId))
    .maybeSingle();
  if (!post) return { error: MESSAGES.NOT_FOUND };
  if (post.content_status === "published") return { error: MESSAGES.PUBLISHED };
  const template = postTemplate(post.template_key);
  if (!template) return { error: MESSAGES.NO_TEMPLATE };
  const off = await loadPostTemplatesOff(
    createSupabaseAdminClient(),
    post.tenant_id,
  );
  if (off.includes(template.key)) return { error: MESSAGES.OFF };

  // A gear series post keeps its caption and the old gear columns in step.
  const series = Array.isArray(post.series) ? post.series[0] : post.series;
  if (
    template.key === GEAR_SPOTLIGHT.key &&
    series?.content_source === "random_gear_item"
  ) {
    return updateGearDetailsAction(post.id, {
      brand: input.brand ?? "",
      best_for: input.best_for ?? "",
      why: input.why ?? "",
      photo: input.photo ?? "",
    });
  }

  // An event template stores only what differs from the event (#1926), so
  // its defaults keep following the event.
  let normalized: ReturnType<typeof normalizeTemplateText>;
  if (isEventTemplateKey(template.key)) {
    const loaded = post.event_id
      ? await loadEventTemplateRecord(
          createSupabaseAdminClient(),
          post.tenant_id,
          post.event_id,
        )
      : null;
    if (!loaded) return { error: MESSAGES.NO_TEMPLATE };
    normalized = normalizeTemplateText(
      POST_TEMPLATES[template.key],
      loaded.record,
      input,
    );
  } else {
    normalized = normalizeTemplateText(GEAR_SPOTLIGHT, null, input);
  }
  if ("error" in normalized) return normalized;
  const text = { ...parseTemplateText(post.template_text) };
  for (const field of template.fields) delete text[field.key];
  const template_text = { ...text, ...normalized.text };
  // main still reads Gear Spotlight's words from the old columns (#1924).
  const gearColumns =
    template.key === GEAR_SPOTLIGHT.key
      ? {
          gear_brand: template_text.brand ?? null,
          gear_best_for: template_text.best_for ?? null,
          gear_why: template_text.why ?? null,
        }
      : {};
  const { error } = await supabase
    .from("content_opportunities")
    .update({ template_text, ...gearColumns })
    .eq("id", post.id)
    .neq("content_status", "published");
  if (error) return { error: "Could not save the template. Please try again." };
  revalidateSocial();
  return { success: true, captionUpdated: false };
}

/**
 * Chooses the template a post is drawn with, from those that fit its records
 * and format and are switched on, or none. Text typed for the old template
 * stays on the post, so choosing it again brings that text back.
 */
export async function setPostTemplateAction(
  postId: string,
  templateKey: string | null,
): Promise<{ error: string } | { success: true }> {
  const auth = await authorize();
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { data: post } = await supabase
    .from("content_opportunities")
    .select(
      "id, tenant_id, content_status, post_format, event_id, featured_inventory_item_id",
    )
    .eq("id", String(postId))
    .maybeSingle();
  if (!post) return { error: MESSAGES.NOT_FOUND };
  if (post.content_status === "published") return { error: MESSAGES.PUBLISHED };

  if (templateKey !== null) {
    const off = await loadPostTemplatesOff(
      createSupabaseAdminClient(),
      post.tenant_id,
    );
    const fits = templatesFor({
      recordKinds: postRecordKinds(post),
      postFormat: post.post_format,
      off,
    });
    if (!fits.some((key) => key === templateKey)) {
      return { error: MESSAGES.DOESNT_FIT };
    }
  }

  const { error } = await supabase
    .from("content_opportunities")
    .update({ template_key: templateKey })
    .eq("id", post.id)
    .neq("content_status", "published");
  if (error)
    return { error: "Could not change the template. Please try again." };
  revalidateSocial();
  return { success: true };
}
