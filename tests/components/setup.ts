// Shared jsdom shims for component tests. Imported explicitly by each
// component test file (the default vitest environment stays node).
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  Object.defineProperty(globalThis, "IntersectionObserver", { value: NoopObserver, writable: true });
}
if (typeof globalThis.ResizeObserver === "undefined") {
  Object.defineProperty(globalThis, "ResizeObserver", { value: NoopObserver, writable: true });
}
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      media: "",
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => cleanup());
