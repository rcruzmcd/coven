"use client";

import { Fragment } from "react";
import { useTabData } from "@/hooks/use-tab-data";
import {
  answerBreakdown,
  type AnswerBreakdownData,
  type AnswerBreakdownSection,
} from "@/lib/person-answer-breakdown";
import { formatNumber } from "@/lib/format";
import { getEventAnswerBreakdownAction } from "./answer-breakdown-actions";
import { CardSummary, Figure } from "./summary-figures";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The event's "Profile answers" card (#1745): for each choice profile question
 * the organization copies at check-in, registrations by answer, nested under
 * the question it depends on (discipline, then level). Read from the
 * check-in snapshots, falling back to current answers for anyone not checked
 * in yet. Listed only where the tenant has such a question and the reader
 * may see profile answers.
 */
export function AnswerBreakdownTab({ eventId }: { eventId: string }) {
  const { data, loadError } = useTabData<AnswerBreakdownData>(
    () => getEventAnswerBreakdownAction(eventId),
    [eventId],
  );

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (data === undefined) return <TabLoadingSkeleton />;

  const sections = answerBreakdown(data);
  if (sections.length === 0) {
    return (
      <EmptyState
        title="No questions to break down"
        description="Choice questions copied at check-in are counted here. Set that up under People › Settings."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="app-muted text-sm">
        Counted per registration that was not cancelled: the answers copied at
        check-in, or the person&apos;s current answers before then.
      </p>
      {sections.map((section) => (
        <QuestionBreakdown
          key={section.questionId}
          section={section}
          registrations={data.registrations}
        />
      ))}
    </div>
  );
}

function QuestionBreakdown({
  section,
  registrations,
}: {
  section: AnswerBreakdownSection;
  registrations: number;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">{section.heading}</h3>
        <p className="app-muted text-sm">{section.prompt}</p>
      </div>
      {section.answered === 0 ? (
        <EmptyState
          title="No answers yet"
          description="Counts appear here as registrants answer."
        />
      ) : (
        <>
          <CardSummary label={`${section.heading} at a glance`}>
            <Figure
              label="Answered"
              value={formatNumber(section.answered)}
              caption={
                section.parentHeading !== null
                  ? `Asked depending on ${section.parentHeading}`
                  : `Of ${formatNumber(registrations)} registrations`
              }
            />
          </CardSummary>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Answer</TableHead>
                <TableHead className="text-right">Registrants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.groups.map((group) => (
                <Fragment key={group.id ?? "all"}>
                  {group.label !== null && (
                    <TableRow>
                      <TableCell className="font-semibold whitespace-normal">
                        {group.label}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {group.registrations === null
                          ? ""
                          : formatNumber(group.registrations)}
                      </TableCell>
                    </TableRow>
                  )}
                  {group.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell
                        className={
                          group.label !== null
                            ? "pl-6 whitespace-normal"
                            : "whitespace-normal"
                        }
                      >
                        {row.label}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.registrations)}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  );
}
