"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Hands focus to `target` when `open` turns false and the control that held
 * focus went away with it.
 *
 * An inline edit form that closes itself -- Save succeeded, or Cancel -- unmounts
 * the button the keyboard user just pressed, focus falls to `<body>`, and the
 * next Tab starts over at the skip link (#1859). `target` is whatever comes
 * back in the form's place, typically the Edit button that opened it.
 *
 * Only a dropped focus is moved: if the user has already gone somewhere else
 * while the save was pending, they stay there.
 */
export function useFocusWhenClosed(
  open: boolean,
  target: RefObject<HTMLElement | null>,
) {
  const wasOpen = useRef(open);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return;
    const current = document.activeElement;
    if (current && current !== document.body) return;
    target.current?.focus();
  }, [open, target]);
}
