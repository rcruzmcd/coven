// The All people header's queue links and settings button (#1760).
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  countDuplicateGroups,
  PeopleHeaderActions,
} from "./people-header-actions";

const ALL = { showDuplicates: true, showClaims: true, showSettings: true };

describe("PeopleHeaderActions", () => {
  test("links each queue with its open count, and Settings to the sub-route", () => {
    render(
      <PeopleHeaderActions {...ALL} counts={{ duplicates: 3, claims: 2 }} />,
    );
    expect(
      screen.getByRole("button", { name: "Duplicates 3 open" }),
    ).toHaveAttribute("href", "/portal/people/duplicates");
    expect(
      screen.getByRole("button", { name: "Account claims 2 open" }),
    ).toHaveAttribute("href", "/portal/people/claims");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "href",
      "/portal/people/settings",
    );
  });

  test("drops the badge for an empty queue or a count that failed to load", () => {
    render(
      <PeopleHeaderActions {...ALL} counts={{ duplicates: 0, claims: null }} />,
    );
    expect(screen.getByRole("button", { name: "Duplicates" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account claims" })).toBeTruthy();
  });

  test("renders only the links the reader may open", () => {
    render(
      <PeopleHeaderActions
        showDuplicates={false}
        showClaims
        showSettings={false}
        counts={{ duplicates: null, claims: 1 }}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Duplicates/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  test("renders nothing for a reader who holds none of them", () => {
    const { container } = render(
      <PeopleHeaderActions
        showDuplicates={false}
        showClaims={false}
        showSettings={false}
        counts={{ duplicates: null, claims: null }}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("countDuplicateGroups", () => {
  test("counts one item per shared address, as the queue lists them", () => {
    expect(
      countDuplicateGroups([
        { email_key: "a@x.org" },
        { email_key: "a@x.org" },
        { email_key: "b@x.org" },
        { email_key: "b@x.org" },
        { email_key: "b@x.org" },
      ]),
    ).toBe(2);
    expect(countDuplicateGroups([])).toBe(0);
  });
});
