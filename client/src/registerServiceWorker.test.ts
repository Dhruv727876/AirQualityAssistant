import { describe, it, expect, vi, afterEach } from "vitest";
import { registerServiceWorker } from "./registerServiceWorker";

describe("registerServiceWorker", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("registers /sw.js after the window load event when serviceWorker is supported", () => {
    const registerMock = vi.fn().mockReturnValue(Promise.resolve());
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      configurable: true,
    });

    registerServiceWorker();

    expect(registerMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing when serviceWorker is unsupported", () => {
    Reflect.deleteProperty(navigator, "serviceWorker");

    expect(() => {
      registerServiceWorker();
      window.dispatchEvent(new Event("load"));
    }).not.toThrow();
  });

  it("a rejected registration does not cause an unhandled rejection", async () => {
    const registerMock = vi.fn().mockReturnValue(Promise.reject(new Error("x")));
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      configurable: true,
    });

    registerServiceWorker();

    window.dispatchEvent(new Event("load"));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(registerMock).toHaveBeenCalledTimes(1);
  });
});
