"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the filter selects apply on change, the way the design shows them, without
 * giving up on working when JavaScript is unavailable.
 *
 * Server-rendered, this is an ordinary submit button, so the surrounding GET form
 * functions on its own. Once mounted it hides itself and submits the form whenever a
 * control changes — which is the only reason any client JavaScript exists on this page.
 */
export function FilterAutoSubmit() {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = ref.current;
    const form = button?.form;
    if (!button || !form) return;

    button.hidden = true;
    const submit = () => form.requestSubmit();
    form.addEventListener("change", submit);
    return () => {
      form.removeEventListener("change", submit);
      button.hidden = false;
    };
  }, []);

  return (
    <button
      ref={ref}
      type="submit"
      className="cursor-pointer rounded-[4px] border border-line-300 bg-surface-control px-2.5 py-[7px] text-[12.5px] font-medium text-ink-900"
    >
      Apply
    </button>
  );
}
