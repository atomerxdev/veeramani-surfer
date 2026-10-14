/** Tiny DOM helpers shared by the UI controllers. */

export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`UI element not found: ${selector}`);
  return element;
}

export function optionalElement<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

/** Find an element by its `data-bind` name, scoped to a screen. */
export function bindTarget(root: ParentNode, name: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-bind="${name}"]`);
}

/** Write text only when it actually changed (keeps the DOM quiet). */
export function setTextIfChanged(element: HTMLElement | null, value: string): void {
  if (!element) return;
  if (element.textContent === value) return;
  element.textContent = value;
}

export function formatScore(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-IN');
}

export function formatDistance(metres: number): string {
  return `${Math.max(0, Math.floor(metres)).toLocaleString('en-IN')} m`;
}

export function formatSeconds(value: number): string {
  const seconds = Math.max(0, value);
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
