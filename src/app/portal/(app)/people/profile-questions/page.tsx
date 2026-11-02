import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { toPersonQuestion, type PersonQuestion } from "@/lib/person-questions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import {
  ProfileQuestionsEditor,
  type QuestionUsage,
} from "./profile-questions-editor";

const TITLE = "Profile questions";

export const metadata: Metadata = { title: TITLE };

/**
 * People › Profile questions (#1743): the questions the organization asks
 * about a person. A settings view beside the People list rather than a card
 * under it, because working the directory and configuring what it asks are
 * different jobs (docs/portal-navigation.md, "Settings beside a work list").
 * Gated on the permission the save checks; with the module off,
 * has_permission() refuses it for everyone.
 */
export default async function ProfileQuestionsPage() {
  const supabase = await createSupabaseServerClient();
  await requirePermission(supabase, "person_answers", "manage", TITLE);

  const [questionsResult, scopesResult, programsResult, usageResult] =
    await Promise.all([
      supabase
        .from("person_questions")
        .select(
          "id, key, kind, prompt, help, column_label, required, options, allow_other, min_value, max_value, place_granularity, place_allow_other, show_if, ask_after_registration, ask_on_my_details, snapshot_at_checkin, archived_at, sort_order, created_at",
        )
        .order("sort_order")
        .order("created_at"),
      supabase.from("person_question_scopes").select("question_id, program_id"),
      // Retired ones too: a question scoped to one must still be unscopable.
      supabase.from("programs").select("id, name").order("name"),
      supabase.rpc("person_question_usage"),
    ]);

  const error =
    questionsResult.error ??
    scopesResult.error ??
    programsResult.error ??
    usageResult.error;

  const scopes = new Map<string, string[]>();
  for (const scope of scopesResult.data ?? []) {
    scopes.set(scope.question_id, [
      ...(scopes.get(scope.question_id) ?? []),
      scope.program_id,
    ]);
  }
  const all = (questionsResult.data ?? []).flatMap((row) => {
    const question = toPersonQuestion(row, scopes.get(row.id));
    return question ? [question] : [];
  });
  const current: PersonQuestion[] = all.filter((q) => q.archived_at === null);
  const archived: PersonQuestion[] = all.filter((q) => q.archived_at !== null);
  const usage: QuestionUsage = Object.fromEntries(
    (usageResult.data ?? []).map((row) => [
      row.question_id,
      Number(row.answers),
    ]),
  );

  return (
    <>
      <PortalBreadcrumbs current={TITLE} />
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {TITLE}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Questions the organization asks about a person, like their experience
        level or household size. Each person keeps one current answer to each.
      </p>

      <div className="mt-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load the profile questions. Please try again.
            </AlertDescription>
          </Alert>
        ) : (
          <ProfileQuestionsEditor
            questions={current}
            archived={archived}
            programs={programsResult.data ?? []}
            usage={usage}
          />
        )}
      </div>
    </>
  );
}
