"use client";

import * as React from "react";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownText } from "@/components/portal/markdown-text";
import {
  continueList,
  indentListItems,
  insertLink,
  toggleInline,
  toggleList,
  type TextEdit,
  type TextSelection,
} from "./markdown-editing";

const TOOLS: {
  label: string;
  icon: React.ReactNode;
  action: (current: TextSelection) => TextEdit | null;
}[] = [
  {
    label: "Bold",
    icon: <Bold />,
    action: (current) => toggleInline(current, "**"),
  },
  {
    label: "Italic",
    icon: <Italic />,
    action: (current) => toggleInline(current, "_"),
  },
  {
    label: "Bulleted list",
    icon: <List />,
    action: (current) => toggleList(current, "bullet"),
  },
  {
    label: "Numbered list",
    icon: <ListOrdered />,
    action: (current) => toggleList(current, "number"),
  },
  { label: "Link", icon: <Link2 />, action: insertLink },
];

/**
 * A plain textarea that makes Markdown easy to write without knowing it
 * (#1872): list continuation on Enter, Tab to nest a list item, a five-button
 * toolbar with Cmd/Ctrl+B, I and K, and a Preview that renders through
 * `MarkdownText`, so the author sees exactly what readers will.
 *
 * Deliberately not a contenteditable. It stays a **controlled `<textarea>`
 * holding a string**, a drop-in for `Textarea`: the same `value`/`onChange`/
 * `onBlur`, so the minutes autosave (`use-autosave.ts`) sees exactly the
 * changes it saw before -- one `onChange` per edit, from the textarea's own
 * input event, whether the edit was typed or came from the toolbar.
 *
 * Every edit goes through `document.execCommand("insertText")`, which is
 * deprecated in name only: it is still the one way to change a textarea that
 * the browser's undo stack records, so Cmd+Z undoes a toolbar action like a
 * keystroke. Where it is unavailable, setting the value and a synthetic
 * `input` event do the same minus undo. No key is handled while an IME composition is
 * in progress.
 *
 * The toolbar buttons are plain actions with names, not toggles: no
 * `aria-pressed`, which would need a state to report for a selection that can
 * be half bold.
 */
export function MarkdownTextarea({
  value,
  onKeyDown,
  ref,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value"> & { value: string }) {
  const textarea = React.useRef<HTMLTextAreaElement | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const setRefs = (node: HTMLTextAreaElement | null) => {
    textarea.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const selection = (): TextSelection | null => {
    const node = textarea.current;
    if (!node) return null;
    return {
      value: node.value,
      start: node.selectionStart,
      end: node.selectionEnd,
    };
  };

  const apply = (edit: TextEdit | null) => {
    const node = textarea.current;
    if (!node || !edit) return;
    node.focus();
    node.setSelectionRange(edit.start, edit.end);
    const expected =
      node.value.slice(0, edit.start) + edit.text + node.value.slice(edit.end);
    if (edit.start !== edit.end || edit.text !== "") {
      let done = false;
      try {
        done =
          edit.text === ""
            ? document.execCommand("delete")
            : document.execCommand("insertText", false, edit.text);
      } catch {
        done = false;
      }
      if (!done || node.value !== expected) {
        // The prototype's setter, not `node.value =`: React tracks a
        // controlled field's value through an instance-level setter, and a
        // write it saw would make the input event below look like no change.
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set?.call(node, expected);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    node.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  };

  const run = (action: (current: TextSelection) => TextEdit | null) => {
    const current = selection();
    if (current) apply(action(current));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    // A key pressed mid-composition belongs to the IME (Safari reports the
    // composing Enter as keyCode 229 without setting isComposing).
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const current = selection();
    if (!current) return;

    let edit: TextEdit | null = null;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && !event.altKey && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === "b") edit = toggleInline(current, "**");
      else if (key === "i") edit = toggleInline(current, "_");
      else if (key === "k") edit = insertLink(current);
    } else if (
      event.key === "Enter" &&
      !modifier &&
      !event.altKey &&
      !event.shiftKey
    ) {
      edit = continueList(current);
    } else if (event.key === "Tab" && !modifier && !event.altKey) {
      edit = indentListItems(current, event.shiftKey);
    }

    if (edit) {
      event.preventDefault();
      apply(edit);
    }
  };

  const handleTool = (event: React.MouseEvent<HTMLButtonElement>) => {
    const tool = TOOLS.find(
      (candidate) => candidate.label === event.currentTarget.dataset.tool,
    );
    if (tool) run(tool.action);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-0.5">
        {!previewing &&
          TOOLS.map((tool) => (
            <Button
              key={tool.label}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={tool.label}
              title={tool.label}
              disabled={props.disabled || props.readOnly}
              // Keep focus and the selection in the textarea: a click that
              // moved focus would blur it (an autosave flush) and lose the
              // selection the action is about to read.
              onMouseDown={(event) => event.preventDefault()}
              data-tool={tool.label}
              onClick={handleTool}
            >
              {tool.icon}
            </Button>
          ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            const leaving = previewing;
            setPreviewing(!previewing);
            if (leaving) requestAnimationFrame(() => textarea.current?.focus());
          }}
        >
          {previewing ? "Write" : "Preview"}
        </Button>
      </div>
      <Textarea
        {...props}
        ref={setRefs}
        value={value}
        hidden={previewing}
        onKeyDown={handleKeyDown}
      />
      {previewing && (
        <div className="min-h-16 w-full rounded-lg border border-input px-2.5 py-2 text-sm">
          {value.trim() === "" ? (
            <p className="app-muted">Nothing to preview.</p>
          ) : (
            <MarkdownText>{value}</MarkdownText>
          )}
        </div>
      )}
    </div>
  );
}
