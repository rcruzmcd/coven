import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarkdownTextarea } from "./markdown-textarea";

function Harness({
  initial,
  onChange,
}: {
  initial: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <MarkdownTextarea
      aria-label="Notes"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onChange?.(event.target.value);
      }}
    />
  );
}

function textbox() {
  return screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement;
}

describe("MarkdownTextarea", () => {
  test("Bold wraps the selection through one ordinary change", () => {
    const changes = mock((value: string) => value);
    render(<Harness initial="say hello" onChange={changes} />);
    textbox().setSelectionRange(4, 9);

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));

    expect(textbox().value).toBe("say **hello**");
    expect(changes).toHaveBeenCalledTimes(1);
    expect(textbox().selectionStart).toBe(6);
    expect(textbox().selectionEnd).toBe(11);
  });

  test("Enter on a list item adds the next marker", () => {
    const changes = mock((value: string) => value);
    render(<Harness initial="1. one" onChange={changes} />);
    textbox().setSelectionRange(6, 6);

    fireEvent.keyDown(textbox(), { key: "Enter" });

    expect(textbox().value).toBe("1. one\n2. ");
    expect(changes).toHaveBeenLastCalledWith("1. one\n2. ");
  });

  test("Cmd+B toggles bold without leaving the field", () => {
    render(<Harness initial="**hi**" />);
    textbox().setSelectionRange(2, 4);

    fireEvent.keyDown(textbox(), { key: "b", metaKey: true });

    expect(textbox().value).toBe("hi");
  });

  test("handles no key while an IME composition is in progress", () => {
    const changes = mock((value: string) => value);
    render(<Harness initial="- one" onChange={changes} />);
    textbox().setSelectionRange(5, 5);

    fireEvent.keyDown(textbox(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(textbox(), { key: "Enter", keyCode: 229 });

    expect(changes).not.toHaveBeenCalled();
  });

  test("Tab outside a list is left to move focus", () => {
    render(<Harness initial="plain" />);
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    textbox().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test("Preview renders what readers will see, and Write returns", () => {
    render(<Harness initial={"**Bold**\nnext"} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(textbox().value).toBe("**Bold**\nnext");
  });
});
