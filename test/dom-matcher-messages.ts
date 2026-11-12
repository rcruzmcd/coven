import { prettyDOM } from "@testing-library/react";

// jest-dom builds its failure messages from `this.utils.stringify` /
// `printReceived` / `printExpected`, passing the DOM node itself. Under Bun
// those helpers format with Bun's inspector, which knows nothing about DOM
// nodes and walks happy-dom's object graph instead: `ownerDocument`, the
// window, listener maps, caches. One failed `.not.toBeInTheDocument()` on a
// bare `<p>` printed 2.7 MB; on a real portal page it ran the process out of
// memory, so CI showed a SIGABRT and no `(fail)` line, and the whole shard was
// lost without naming the test (#1853, first seen in #1786).
//
// So every jest-dom matcher runs with a `utils` whose helpers render a node as
// its markup, capped at MAX_NODE_CHARS, and pass everything else through.

/** Plenty to recognise an element; small enough that no message can balloon. */
export const MAX_NODE_CHARS = 2_000;

type Utils = {
  stringify: (value: unknown) => string;
  printReceived: (value: unknown) => string;
  printExpected: (value: unknown) => string;
  RECEIVED_COLOR: (text: string) => string;
  EXPECTED_COLOR: (text: string) => string;
  printWithType?: (
    name: string,
    value: unknown,
    print: (value: unknown) => string,
  ) => string;
};

type MatcherFn = (this: { utils: Utils }, ...args: never[]) => unknown;

function isDomNode(value: unknown): value is Node {
  return typeof Node !== "undefined" && value instanceof Node;
}

/** A node as markup, truncated, never as an object graph. */
export function describeNode(node: Node): string {
  const markup =
    node.nodeType === Node.ELEMENT_NODE ||
    node.nodeType === Node.DOCUMENT_NODE ||
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? prettyDOM(node as Element, MAX_NODE_CHARS, { highlight: false })
      : `${node.nodeName} ${JSON.stringify(node.textContent ?? "")}`;
  const text = typeof markup === "string" ? markup : node.nodeName;
  return text.length > MAX_NODE_CHARS
    ? `${text.slice(0, MAX_NODE_CHARS)}...`
    : text;
}

function compactUtils(utils: Utils): Utils {
  const overrides: Partial<Utils> = {
    stringify: (value) =>
      isDomNode(value) ? describeNode(value) : utils.stringify(value),
    printReceived: (value) =>
      isDomNode(value)
        ? utils.RECEIVED_COLOR(describeNode(value))
        : utils.printReceived(value),
    printExpected: (value) =>
      isDomNode(value)
        ? utils.EXPECTED_COLOR(describeNode(value))
        : utils.printExpected(value),
    // Bun's utils has no printWithType, which jest-dom calls when the received
    // value isn't an element at all -- so that message threw a TypeError.
    printWithType:
      utils.printWithType?.bind(utils) ??
      ((name, value, print) =>
        `${name} has type:  ${value === null ? "null" : typeof value}\n${name} has value: ${print(value)}`),
  };
  // Everything else (`matcherHint`, the colours, ...) is Bun's own, called on
  // Bun's object: its helpers are native getters and methods.
  return new Proxy(utils, {
    get: (target, prop) => {
      if (prop in overrides) return overrides[prop as keyof Utils];
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * `matchers` with each one's `this.utils` swapped for {@link compactUtils}.
 * A Proxy rather than `Object.create`, because Bun's matcher context exposes
 * `isNot`, `equals` and `utils` as native getters that must see the real
 * context as their receiver.
 */
export function withCompactDomMessages<T extends Record<string, unknown>>(
  matchers: T,
): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, matcher] of Object.entries(matchers)) {
    if (typeof matcher !== "function") continue;
    wrapped[name] = function (this: { utils: Utils }, ...args: never[]) {
      const utils = compactUtils(this.utils);
      const proxy = new Proxy(this, {
        get: (target, prop) => {
          if (prop === "utils") return utils;
          const value = Reflect.get(target, prop, target);
          // `equals` and friends are native and check their receiver.
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return (matcher as MatcherFn).apply(proxy, args);
    };
  }
  return wrapped as T;
}
