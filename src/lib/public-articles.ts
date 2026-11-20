import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveArticleCategories,
  type ArticleCategoryRow,
  type ArticleCategoryWithArticles,
  type PublicArticleRow,
} from "@/lib/articles";
import { reportIfQueryFailed } from "@/lib/observability/query-error";

/**
 * The public site's read of the tenant's article collection (#894).
 *
 * Two views, both resolved from the request host: `public_article_categories`
 * and `public_articles`. They serve published rows only -- a draft has no
 * column in either -- so nothing here has to know what a draft is.
 *
 * Cached per request the way `getPublicSite()` is: `/learn/[slug]` asks once
 * for the page and once more from `generateMetadata`.
 */
export const getPublicArticleCategories = cache(
  async (supabase: SupabaseClient): Promise<ArticleCategoryWithArticles[]> => {
    const [categories, articles] = await Promise.all([
      supabase
        .from("public_article_categories")
        .select("id, slug, value")
        .order("position"),
      supabase
        .from("public_articles")
        .select("id, category_id, anchor, value")
        .order("position"),
    ]);

    if (categories.error || articles.error) {
      // Same stance as `getPublicSite`: render what we can and say so, because
      // a silent empty section looks like the editor refusing to save.
      const message = "could not read the article collection; rendering none";
      reportIfQueryFailed(
        categories,
        "public-articles.public_article_categories",
        message,
      );
      reportIfQueryFailed(articles, "public-articles.public_articles", message);
      return [];
    }

    return resolveArticleCategories(
      (categories.data ?? []) as ArticleCategoryRow[],
      (articles.data ?? []) as PublicArticleRow[],
    );
  },
);

/** One category by its `/learn/<slug>` segment, or null when there is none. */
export async function getPublicArticleCategory(
  supabase: SupabaseClient,
  slug: string,
): Promise<ArticleCategoryWithArticles | null> {
  const categories = await getPublicArticleCategories(supabase);
  return categories.find((category) => category.slug === slug) ?? null;
}
