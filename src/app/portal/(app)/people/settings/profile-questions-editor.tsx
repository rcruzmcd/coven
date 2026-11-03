"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArchiveRestore, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runAction } from "@/components/portal/action-toast";
import { QuestionCard } from "@/components/portal/question-editor";
import { useUnsavedChangesGuard } from "@/components/portal/unsaved-changes-guard";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { usePortalDevice } from "@/lib/portal/device-context";
import { cn } from "@/lib/utils";
import { MAX_QUESTIONS } from "@/lib/registration-questions";
import { normalizeConditions } from "@/lib/question-drafts";
import {
  PERSON_QUESTION_KINDS,
  type PersonQuestion,
} from "@/lib/person-questions";
import {
  newPersonQuestionDraft,
  personQuestionChanges,
  personQuestionDrafts,
  personQuestionsDraftError,
  personQuestionsPayload,
  type PersonQuestionDraft,
} from "./profile-questions-draft";
import {
  DataFields,
  QuestionPreview,
  WhoIsAskedFields,
  type ProgramOption,
} from "./profile-question-fields";
import { ProfileQuestionList, answeredBy } from "./profile-question-list";
import {
  savePersonQuestionsAction,
  type ProfileQuestionsActionResult,
} from "./actions";

export type { ProgramOption };

/** How many people answered a question, by its id. */
export type QuestionUsage = Record<string, number>;

/** People lists and exports head a column with it; the prompt is a sentence. */
const COLUMN_LABEL = {
  label: "Column name in lists and exports",
  description:
    "A word or two, like “Level”. Left blank, the start of the prompt is used.",
};

const TABS = ["questions", "metrics", "archived"] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

/** The selected question's param, beside `?tab=`. */
const QUESTION_PARAM = "question";

/**
 * The tenant's profile questions (#1743), redesigned in #1761 as a list to
 * scan beside one question's editor, with the figures and the archived
 * questions on tabs of their own. Every question is still saved together,
 * in one `savePersonQuestionsAction` call, from a save bar that stays on
 * screen while anything is unsaved. The selected question is in
 * `?question=`, so it can be linked and survives Back; on a phone the list
 * fills the page and the editor opens in a sheet.
 *
 * A question removed while people have answered it is archived with their
 * answers and listed on Archived, where it can be restored.
 */
export function ProfileQuestionsEditor({
  questions,
  archived,
  programs,
  usage,
  metrics,
}: {
  questions: PersonQuestion[];
  archived: PersonQuestion[];
  programs: ProgramOption[];
  usage: QuestionUsage;
  /** The Metrics tab's own editor, saved apart from the questions. */
  metrics?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = usePortalDevice() === "mobile";
  const [tab, setTab] = useUrlTabState<Tab>({
    fallback: "questions",
    isValid: isTab,
  });
  const [saved, setSaved] = useState(() => personQuestionDrafts(questions));
  const [drafts, setDrafts] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const changes = personQuestionChanges(drafts, saved);
  const dirty = changes > 0;
  useUnsavedChangesGuard(dirty);

  const restorable = personQuestionDrafts(archived).filter(
    (draft) => !drafts.some((other) => other.id === draft.id),
  );

  const linked = searchParams.get(QUESTION_PARAM);
  const linkedIndex = drafts.findIndex((draft) => draft.id === linked);
  // A desktop always shows an editor; a phone only while one is picked.
  const selectedIndex = linkedIndex >= 0 || phone ? linkedIndex : 0;
  const selected = drafts[selectedIndex] ?? null;

  // Selecting a question moves focus to its editor (#1761), but loading the
  // page or pressing Back does not: only `select()` asks for it.
  const editor = useRef<HTMLElement>(null);
  const focusEditor = useRef(false);
  useEffect(() => {
    if (!focusEditor.current) return;
    focusEditor.current = false;
    editor.current?.focus();
  }, [selected?.id]);

  function select(id: string) {
    if (id === selected?.id && !phone) {
      editor.current?.focus();
      return;
    }
    focusEditor.current = !phone;
    setTab("questions", { [QUESTION_PARAM]: id });
  }

  function closeSheet() {
    setTab("questions", { [QUESTION_PARAM]: null });
  }

  function setQuestions(next: PersonQuestionDraft[]) {
    // A condition an edit made impossible is dropped at once.
    setDrafts(normalizeConditions(next));
  }

  function update(index: number, patch: Partial<PersonQuestionDraft>) {
    setQuestions(
      drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
  }

  function addQuestion() {
    const draft = newPersonQuestionDraft();
    setDrafts([...drafts, draft]);
    select(draft.id);
  }

  function discard() {
    setDrafts(saved);
    setError(null);
  }

  function save() {
    const problem = personQuestionsDraftError(drafts);
    setError(problem);
    if (problem) return;
    const submitted = drafts;
    startTransition(async () => {
      await runAction<ProfileQuestionsActionResult>(
        () => savePersonQuestionsAction(personQuestionsPayload(submitted)),
        {
          success: "Profile questions saved.",
          onError: setError,
          onSuccess: () => {
            setSaved(submitted);
            router.refresh();
          },
        },
      );
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save();
  }

  const answers = selected ? (usage[selected.id] ?? 0) : 0;
  const editorPane = selected ? (
    <div className="flex flex-col gap-6">
      {answers > 0 ? (
        <p className="app-muted text-sm">
          {answeredBy(answers)[0].toUpperCase() + answeredBy(answers).slice(1)}.
          Its answer type can&apos;t change now; archive options people chose
          rather than removing them.
        </p>
      ) : null}
      <QuestionCard
        questions={drafts}
        index={selectedIndex}
        idPrefix="profile"
        kinds={PERSON_QUESTION_KINDS}
        columnLabel={COLUMN_LABEL}
        disabled={isPending}
        onUpdate={(patch) =>
          // The card edits the shared fields only, so its patch is one of ours.
          update(selectedIndex, patch as Partial<PersonQuestionDraft>)
        }
        onMove={(by) => {
          const next = [...drafts];
          const [moved] = next.splice(selectedIndex, 1);
          next.splice(selectedIndex + by, 0, moved);
          setQuestions(next);
        }}
        onRemove={() => {
          setQuestions(drafts.filter((_, i) => i !== selectedIndex));
          closeSheet();
        }}
        groups={{
          whoIsAsked: (
            <WhoIsAskedFields
              question={selected}
              programs={programs}
              disabled={isPending}
              onUpdate={(patch) => update(selectedIndex, patch)}
            />
          ),
          data: (
            <DataFields
              question={selected}
              disabled={isPending}
              onUpdate={(patch) => update(selectedIndex, patch)}
            />
          ),
        }}
      />
      <QuestionPreview question={selected} />
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList variant="line">
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="archived">
            Archived{restorable.length > 0 ? ` (${restorable.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4">
          <form onSubmit={handleSubmit}>
            <p className="app-muted max-w-2xl text-sm">
              Each person has one current answer to each question. Staff see
              every question on the person form; where it&apos;s asked says
              where people are asked themselves. Removing a question people have
              answered archives it with their answers.
            </p>

            <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
                {drafts.length === 0 ? (
                  <p className="app-muted text-sm">
                    No questions yet. Until you add one, nobody is asked
                    anything.
                  </p>
                ) : (
                  <ProfileQuestionList
                    questions={drafts}
                    selectedId={selected?.id ?? null}
                    usage={usage}
                    disabled={isPending}
                    onSelect={select}
                    onReorder={setQuestions}
                  />
                )}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || drafts.length >= MAX_QUESTIONS}
                    onClick={addQuestion}
                  >
                    <Plus /> Add question
                  </Button>
                </div>
              </div>

              {phone ? null : (
                <section
                  ref={editor}
                  tabIndex={-1}
                  aria-label={
                    selected
                      ? `Question ${selectedIndex + 1} editor`
                      : "Question editor"
                  }
                  className="min-w-0 rounded-xl border border-[var(--line)] p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {editorPane ?? (
                    <p className="app-muted text-sm">
                      Add a question to start.
                    </p>
                  )}
                </section>
              )}
            </div>
          </form>
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          {metrics}
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <ArchivedQuestions
            restorable={restorable}
            usage={usage}
            disabled={isPending || drafts.length >= MAX_QUESTIONS}
            onRestore={(draft) =>
              // Its condition may name a question that has gone since.
              setDrafts(normalizeConditions([...drafts, draft]))
            }
          />
        </TabsContent>
      </Tabs>

      {phone ? (
        <Sheet
          open={selected !== null}
          onOpenChange={(open) => !open && closeSheet()}
        >
          <SheetContent size="lg">
            <SheetHeader>
              <SheetTitle>
                {selected?.prompt.trim() || "Untitled question"}
              </SheetTitle>
              <SheetDescription>
                Changes are kept here until you save the questions.
              </SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-4">{editorPane}</div>
          </SheetContent>
        </Sheet>
      ) : null}

      {dirty || isPending ? (
        // Sticky for the reason Automatic replies' is: the control that
        // commits should not be the thing you scroll to find. On a phone it
        // sits above the fixed bottom nav rather than under it.
        <div
          className={cn(
            "rainbow-surface sticky z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md",
            phone
              ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
              : "bottom-4",
          )}
        >
          <p className="text-sm font-medium" aria-live="polite">
            {changes === 1
              ? "1 unsaved change to the questions"
              : `${changes} unsaved changes to the questions`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={discard}
            >
              Discard
            </Button>
            <Button type="button" disabled={isPending} onClick={save}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save questions"
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArchivedQuestions({
  restorable,
  usage,
  disabled,
  onRestore,
}: {
  restorable: PersonQuestionDraft[];
  usage: QuestionUsage;
  disabled?: boolean;
  onRestore: (draft: PersonQuestionDraft) => void;
}) {
  if (restorable.length === 0) {
    return <p className="app-muted text-sm">No archived questions.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Archived questions</h2>
      <p className="app-muted text-sm">
        No longer asked. People&apos;s answers are kept. Restoring one adds it
        to the end of the questions; save to ask it again.
      </p>
      <ul className="flex flex-col gap-2">
        {restorable.map((draft) => (
          <li
            key={draft.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <span className="min-w-0 text-sm">
              {draft.prompt}
              <span className="app-muted">
                {" "}
                &middot; {answeredBy(usage[draft.id] ?? 0)}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onRestore(draft)}
            >
              <ArchiveRestore /> Restore
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
