"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QUESTION_KIND_LABELS } from "@/lib/registration-questions";
import { moveItem } from "@/lib/publications";
import { cn } from "@/lib/utils";
import type { PersonQuestionDraft } from "./profile-questions-draft";

/** Where a question is asked, as the list's chips name it. */
export function askedIn(question: PersonQuestionDraft): string[] {
  return [
    question.askAfterRegistration && "Registration",
    question.askOnMyDetails && "My details",
    question.snapshotAtCheckin && "Check-in snapshot",
  ].filter((chip): chip is string => typeof chip === "string");
}

export function answeredBy(count: number) {
  return count === 1 ? "answered by 1 person" : `answered by ${count} people`;
}

/**
 * The profile questions as a list to scan (#1761): one row each, with what is
 * asked, its type, whether it's required and where it's asked, so ten
 * questions read without passing an editor. A row selects its question; drag
 * or Alt+Arrow reorders.
 */
export function ProfileQuestionList({
  questions,
  selectedId,
  usage,
  disabled,
  onSelect,
  onReorder,
}: {
  questions: PersonQuestionDraft[];
  selectedId: string | null;
  usage: Record<string, number>;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onReorder: (questions: PersonQuestionDraft[]) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Written in a ref callback and read only in event handlers.
  const rows = useRef<Record<string, HTMLButtonElement>>({});

  function move(from: number, to: number) {
    if (to < 0 || to >= questions.length || from === to) return;
    const moved = questions[from];
    onReorder(moveItem(questions, from, to));
    setAnnouncement(
      `${moved.prompt.trim() || "Untitled question"} moved to position ${to + 1} of ${questions.length}.`,
    );
    // Moving the row can drop focus in some browsers; put it back.
    requestAnimationFrame(() => rows.current[moved.id]?.focus());
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    if (disabled || !event.altKey) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, index + (event.key === "ArrowUp" ? -1 : 1));
    }
  }

  return (
    <>
      <p id="profile-question-list-hint" className="sr-only">
        Alt plus Up or Down arrow moves a question.
      </p>
      <ol aria-label="Questions" className="flex flex-col gap-2">
        {questions.map((question, index) => {
          const selected = question.id === selectedId;
          const answers = usage[question.id] ?? 0;
          return (
            <li
              key={question.id}
              draggable={!disabled}
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
                "flex items-stretch rounded-lg border border-[var(--line)] bg-card",
                selected && "border-primary bg-primary/5",
                over === index && dragging !== index && "border-primary",
                dragging === index && "opacity-60",
              )}
            >
              <span className="flex items-center pl-2" aria-hidden="true">
                <GripVertical className="app-muted size-4 cursor-grab" />
              </span>
              <button
                type="button"
                ref={(element) => {
                  if (element) rows.current[question.id] = element;
                  else delete rows.current[question.id];
                }}
                aria-current={selected ? "true" : undefined}
                aria-describedby="profile-question-list-hint"
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => onSelect(question.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className="text-sm font-medium">
                  <span className="app-muted">{index + 1}. </span>
                  {question.prompt.trim() || (
                    <span className="app-muted italic">Untitled question</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="muted">
                    {QUESTION_KIND_LABELS[question.kind]}
                  </Badge>
                  {question.required ? (
                    <Badge variant="warning">Required</Badge>
                  ) : null}
                  {askedIn(question).map((chip) => (
                    <Badge key={chip} variant="outline">
                      {chip}
                    </Badge>
                  ))}
                  {answers > 0 ? (
                    <span className="app-muted text-xs">
                      {answeredBy(answers)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
