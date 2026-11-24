"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import {
  POST_TEMPLATES,
  type PostTemplateKey,
} from "@/lib/social-content/post-templates";
import { updatePostTemplatesOffAction } from "./actions";

/**
 * Switches each post template on or off for the organization (#1925). Off
 * takes it out of the post page's picker and stops new images being drawn
 * with it; posts already drawn keep their images.
 */
export function PostTemplatesPanel({ off }: { off: PostTemplateKey[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState<string[]>(off);
  const [isPending, startTransition] = useTransition();

  function toggle(key: PostTemplateKey, on: boolean) {
    const previous = current;
    const next = on
      ? current.filter((entry) => entry !== key)
      : [...current, key];
    setCurrent(next);
    startTransition(async () => {
      await runAction(() => updatePostTemplatesOffAction(next), {
        success: on ? "Template switched on." : "Template switched off.",
        onError: () => setCurrent(previous),
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post templates</CardTitle>
        <CardDescription>
          Branded images a social post is drawn with from its record. A template
          that is off can&apos;t be chosen on a post; images already made with
          it stay.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Object.values(POST_TEMPLATES).map((template) => {
          const id = `post-template-${template.key}`;
          return (
            <Field key={template.key} orientation="horizontal">
              <Switch
                id={id}
                checked={!current.includes(template.key)}
                disabled={isPending}
                onCheckedChange={(on) => toggle(template.key, on)}
              />
              <FieldLabel htmlFor={id}>{template.label}</FieldLabel>
            </Field>
          );
        })}
      </CardContent>
    </Card>
  );
}
