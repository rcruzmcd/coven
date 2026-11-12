import { expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { focusedName } from "../../../../../../test/focused";
import { GenerateMissingButton } from "./generate-missing-button";
import { GenerateSeriesButton } from "./generate-series-button";

// Generating takes the series off the missing list, and the button with it
// (#1863); generating them all takes the whole list.
function missing(ids: string[]) {
  return (
    <section>
      <h2>Missing recurring instances for 2027</h2>
      {ids.length > 0 && (
        <div>
          <ul>
            {ids.map((id) => (
              <li key={id}>
                {id}
                <GenerateSeriesButton itemId={id} />
              </li>
            ))}
          </ul>
          <GenerateMissingButton targetYear={2027} />
        </div>
      )}
    </section>
  );
}

test("a generated series hands focus to the next one's Generate", async () => {
  const { rerender } = render(missing(["pride", "tdov"]));
  const [prideGenerate] = screen.getAllByRole("button", { name: "Generate" });
  act(() => prideGenerate.focus());
  rerender(missing(["tdov"]));
  await waitFor(() => expect(focusedName()).toBe("Generate"));
  expect(document.activeElement?.closest("li")?.textContent).toContain("tdov");
});

test("Generate all hands focus to the card heading once the list is gone", async () => {
  const { rerender } = render(missing(["pride"]));
  act(() =>
    screen.getByRole("button", { name: "Generate all for 2027" }).focus(),
  );
  rerender(missing([]));
  await waitFor(() =>
    expect(focusedName()).toBe("Missing recurring instances for 2027"),
  );
});
