import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { RegistrationOptionsEditor } from "./registration-options-editor";

describe("RegistrationOptionsEditor", () => {
  test("distinguishes per-person options from registration questions", () => {
    render(
      <RegistrationOptionsEditor
        value={{
          prompt: "",
          options: [
            {
              key: "option-1",
              id: "option-1",
              label: "Standard",
              cap: "",
              price: "",
            },
          ],
        }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Per-person options")).toBeTruthy();
    expect(
      screen.getByText(
        "Optional. Each registrant splits their party across these options. A cap closes an option once it's full. Prices aren't shown publicly; discount codes are valued against them.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Question shown to registrants" }),
    ).toBeTruthy();
  });
});
