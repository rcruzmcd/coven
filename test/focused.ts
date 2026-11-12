/**
 * What has keyboard focus, as a short string: the element's `aria-label`,
 * else its text, else its tag. `<body>` is "BODY".
 *
 * Focus tests compare this rather than `toBe(element)`. A failing `toBe` on
 * two DOM nodes makes Bun diff happy-dom's whole object graph, which hangs the
 * run instead of reporting it (#1853); a string fails in one line.
 */
export function focusedName(): string {
  const active = document.activeElement;
  if (!active || active === document.body) return "BODY";
  return (
    active.getAttribute("aria-label") ??
    (active.textContent?.trim() || active.tagName)
  );
}
