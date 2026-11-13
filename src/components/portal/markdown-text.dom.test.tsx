import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MarkdownText } from "./markdown-text";

/**
 * The security half of this file is the reason `react-markdown` was chosen
 * over `marked` + `dompurify` (#1201): raw HTML never becomes markup in the
 * first place, so there is nothing to sanitise afterwards. These tests are
 * what would fail if someone added `rehype-raw` later.
 */
describe("MarkdownText", () => {
  test("renders the conventions a notetaker actually types", () => {
    const { container } = render(
      <MarkdownText>
        {"- First\n- Second\n\n**Bold** and *italic*"}
      </MarkdownText>,
    );

    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("Bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    // No literal asterisks left over -- the whole point of rendering it.
    expect(container.textContent).not.toContain("**");
  });

  test("keeps lines typed one under another as separate lines (#1871)", () => {
    const { container } = render(
      <MarkdownText>
        {"Motion passed 4-0\nTreasurer to send report\nNext meeting in March"}
      </MarkdownText>,
    );

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelectorAll("br")).toHaveLength(2);
    expect(container.querySelector("p")?.innerHTML).toBe(
      "Motion passed 4-0<br>\nTreasurer to send report<br>\nNext meeting in March",
    );
  });

  test("still separates paragraphs on a blank line", () => {
    const { container } = render(
      <MarkdownText>{"One paragraph\n\nAnother"}</MarkdownText>,
    );

    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("br")).toBeNull();
  });

  test("renders GFM tables and strikethrough", () => {
    const { container } = render(
      <MarkdownText>
        {"| Item | Owner |\n| --- | --- |\n| Budget | Jamie |\n\n~~dropped~~"}
      </MarkdownText>,
    );

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("del")?.textContent).toBe("dropped");
  });

  test("drops a javascript: link but keeps its text", () => {
    const { container } = render(
      <MarkdownText>{"[Click me](javascript:alert(1))"}</MarkdownText>,
    );

    // `defaultUrlTransform` blanks the href rather than leaving the scheme in,
    // which also costs the anchor its link role -- queried off the DOM for
    // that reason rather than through `getByRole`.
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Click me");
    expect(link?.getAttribute("href")).toBe("");
  });

  test("keeps an ordinary link", () => {
    render(
      <MarkdownText>{"[Bylaws](https://example.com/bylaws)"}</MarkdownText>,
    );

    expect(screen.getByRole("link", { name: "Bylaws" })).toHaveAttribute(
      "href",
      "https://example.com/bylaws",
    );
  });

  test("renders a literal <script> in a note as text, not as markup", () => {
    const { container } = render(
      <MarkdownText>
        {"Vendor said <script>alert('xss')</script> was fine"}
      </MarkdownText>,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert('xss')</script>");
  });

  test("renders an <img onerror=...> in a note as text, not as markup", () => {
    const { container } = render(
      <MarkdownText>{'<img src=x onerror="alert(1)">'}</MarkdownText>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  test("degrades a heading in a note to its text", () => {
    const { container } = render(
      <MarkdownText>{"# Budget\n\nDiscussed at length."}</MarkdownText>,
    );

    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).toContain("Budget");
  });

  test("keeps top-level headings for Markdown this app generated", () => {
    const { container } = render(
      <MarkdownText allow="document">
        {"# Minutes — Sep 1, 2026\n\n## Opening\n\nCalled to order."}
      </MarkdownText>,
    );

    expect(container.querySelector("h1")?.textContent).toBe(
      "Minutes — Sep 1, 2026",
    );
    expect(container.querySelector("h2")?.textContent).toBe("Opening");
  });

  test("renders nothing at all for empty text", () => {
    const { container } = render(<MarkdownText>{"   \n  "}</MarkdownText>);
    expect(container).toBeEmptyDOMElement();
  });
});
