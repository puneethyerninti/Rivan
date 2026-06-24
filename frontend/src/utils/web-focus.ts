export function blurActiveWebElement() {
  if (typeof document === "undefined") return;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return;
  if (typeof active.blur === "function") {
    active.blur();
  }
}
