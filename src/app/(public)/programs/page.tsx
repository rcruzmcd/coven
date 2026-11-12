import { MarkdownText } from "@/components/portal/markdown-text";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getSiteLayout } from "@/lib/site-layout";
import { listPublicPrograms } from "./programs-data";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Programs") };
}

type Pillar = { label: string; description: string };

/** What `programs.items` holds: a content list is strings all the way down. */
type ContentProgram = {
  pillar: string;
  emoji?: string;
  name: string;
  description: string;
};

/** What a card renders from, whichever source it came out of. */
type Program = {
  pillar: string | null;
  emoji?: string | null;
  name: string;
  description: string | null;
};

function ProgramCard({ program }: { program: Program }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {program.emoji && <span aria-hidden>{program.emoji}</span>}
          {program.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MarkdownText className="app-muted text-sm leading-relaxed">
          {program.description}
        </MarkdownText>
      </CardContent>
    </Card>
  );
}

function ProgramGrid({ programs }: { programs: Program[] }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {programs.map((program) => (
        <ProgramCard key={program.name} program={program} />
      ))}
    </div>
  );
}

export default async function ProgramsPage() {
  const supabase = await createSupabaseServerClient();
  // Both reads are `cache()`-wrapped and neither depends on the other, so the
  // source switch costs one extra query in module mode and none in content
  // mode.
  const [{ content }, layout] = await Promise.all([
    getPublicSite(supabase),
    getSiteLayout(supabase),
  ]);
  const pillars = content.list<Pillar>("programs.pillars");

  // The two sources produce the same card, which is the whole point of the
  // setting: a tenant can move its programs into the module without the page
  // it publishes changing shape (#898).
  const moduleMode = layout.programsSource === "module";
  const programs: Program[] = moduleMode
    ? await listPublicPrograms(supabase)
    : content.list<ContentProgram>("programs.items");

  // A program whose pillar matches no heading would otherwise be a card
  // nobody can find. Module mode is where that happens -- a pillar renamed in
  // the copy after a program named it, or a program with no pillar at all --
  // so the trailing section is module mode's. In content mode an unmatched
  // item has always simply not rendered, and the page is meant to look
  // exactly as it does today while the setting is Site Content.
  const pillarLabels = new Set(pillars.map((pillar) => pillar.label));
  const ungrouped = moduleMode
    ? programs.filter(
        (program) => !program.pillar || !pillarLabels.has(program.pillar),
      )
    : [];

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
            {content.text("programs.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("programs.intro")}
        </p>
      </section>

      {moduleMode && programs.length === 0 ? (
        <p className="app-muted text-sm leading-relaxed sm:text-base">
          {content.text("programs.empty")}
        </p>
      ) : (
        <>
          {pillars.map((pillar) => (
            <section key={pillar.label}>
              <h2 className="app-eyebrow">{pillar.label}</h2>
              <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed sm:text-base">
                {pillar.description}
              </p>

              <ProgramGrid
                programs={programs.filter(
                  (program) => program.pillar === pillar.label,
                )}
              />
            </section>
          ))}

          {ungrouped.length > 0 && (
            <section>
              <ProgramGrid programs={ungrouped} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
