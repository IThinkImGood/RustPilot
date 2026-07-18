export type TooltipEvent = "hover-start" | "hover-end" | "focus" | "blur" | "toggle";

export function nextTooltipVisible(current: boolean, event: TooltipEvent): boolean {
  if (event === "hover-start" || event === "focus") return true;
  if (event === "hover-end" || event === "blur") return false;
  return !current;
}
