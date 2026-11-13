import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLDivElement;
  root: Root;
  render(node: ReactNode): void;
  unmount(): void;
}

export function mount(node: ReactNode): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const m: Mounted = {
    container,
    root,
    render(next) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
  m.render(node);
  return m;
}
