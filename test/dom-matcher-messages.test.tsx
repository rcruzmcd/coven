import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MAX_NODE_CHARS } from "./dom-matcher-messages";

// A failing jest-dom matcher must report the element's markup in a message
// small enough to print, never Bun's dump of happy-dom's object graph, which
// ran to 2.7 MB for one `<p>` and aborted CI shards (#1853). The wrapper lives
// in test/setup.ts; these assertions fail if it is removed or bypassed.

const LIMIT = 10_000;

function failureMessage(assertion: () => void): string {
  try {
    assertion();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the assertion to fail");
}

test("a failed .not.toBeInTheDocument() names the element as markup", () => {
  render(
    <div>
      <p>1 unsaved change</p>
    </div>,
  );
  const message = failureMessage(() =>
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument(),
  );
  expect(message.length).toBeLessThan(LIMIT);
  expect(message).toContain("<p>");
  expect(message).toContain("1 unsaved change");
  expect(message).not.toContain("Symbol(");
});

test("an element message is truncated however large the subtree", () => {
  render(
    <ul>
      {Array.from({ length: 2_000 }, (_, i) => (
        <li key={i}>row {i}</li>
      ))}
    </ul>,
  );
  const message = failureMessage(() =>
    expect(screen.getByRole("list")).not.toBeInTheDocument(),
  );
  expect(message.length).toBeLessThan(MAX_NODE_CHARS + 1_000);
});

test("a non-element received value still produces a message", () => {
  const message = failureMessage(() =>
    expect({ not: "a node" }).toBeInTheDocument(),
  );
  expect(message.length).toBeLessThan(LIMIT);
  expect(message).toContain("value must be an HTMLElement");
});
