import { describe, expect, mock, test } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";

// Issue #1117: the mobile shell's 44px hit area is selected in CSS by
// `[data-size^="icon"]`. Nothing in TypeScript reads that attribute, so
// deleting it would be a silent, phone-only regression -- this is the guard.
describe("Button's size attribute", () => {
  test("carries the size variant into the DOM", () => {
    render(<Button size="icon-sm">Edit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "icon-sm");
  });

  test("names the default size rather than omitting it", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "default");
  });

  test("every icon size shares the prefix the CSS matches on", () => {
    const sizes = ["icon", "icon-xs", "icon-sm", "icon-lg"] as const;
    for (const size of sizes) {
      const { unmount } = render(<Button size={size} aria-label={size} />);
      expect(screen.getByLabelText(size).dataset.size).toStartWith("icon");
      unmount();
    }
  });
});

// #1855. A button that disables itself while its own action runs used to
// throw keyboard focus to <body>: the native `disabled` attribute blurs it.
function SelfDisablingButton({
  onAction,
  focusableWhenDisabled,
}: {
  onAction: () => void;
  focusableWhenDisabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      disabled={pending}
      focusableWhenDisabled={focusableWhenDisabled}
      onClick={() => {
        onAction();
        setPending(true);
      }}
    >
      Check in
    </Button>
  );
}

describe("Button that disables itself during its action", () => {
  test("with focusableWhenDisabled, keeps focus while its action is pending", async () => {
    const user = userEvent.setup();
    const onAction = mock(() => {});
    render(<SelfDisablingButton onAction={onAction} focusableWhenDisabled />);

    const button = screen.getByRole("button", { name: "Check in" });
    button.focus();
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(button);
    expect(button).not.toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-disabled", "true");
    // What the dimmed style keys off, since `:disabled` no longer matches.
    expect(button).toHaveAttribute("data-disabled");

    // Still inert: a second press does not run the action again.
    await user.keyboard("{Enter}");
    await user.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("without it, the native attribute is used", async () => {
    const user = userEvent.setup();
    render(<SelfDisablingButton onAction={() => {}} />);

    const button = screen.getByRole("button", { name: "Check in" });
    await user.click(button);

    expect(button).toBeDisabled();
  });
});
