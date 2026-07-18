"use client";
import { useId, useState } from "react";
import { nextTooltipVisible } from "./tooltipState";

export function Tooltip({ text, example, label = "Meer informatie" }: { text: string; example?: string; label?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <span className="tooltip-root">
      <button
        type="button"
        className="tooltip-trigger"
        aria-label={label}
        aria-describedby={visible ? id : undefined}
        onMouseEnter={() => setVisible((current) => nextTooltipVisible(current, "hover-start"))}
        onMouseLeave={() => setVisible((current) => nextTooltipVisible(current, "hover-end"))}
        onFocus={() => setVisible((current) => nextTooltipVisible(current, "focus"))}
        onBlur={() => setVisible((current) => nextTooltipVisible(current, "blur"))}
        onClick={() => setVisible((current) => nextTooltipVisible(current, "toggle"))}
      >
        ⓘ
      </button>
      <span id={id} role="tooltip" className={`tooltip-bubble${visible ? " is-visible" : ""}`}>
        {text}
        {example && <span className="tooltip-example">{example}</span>}
      </span>
    </span>
  );
}
