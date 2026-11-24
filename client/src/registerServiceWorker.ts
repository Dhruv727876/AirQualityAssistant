export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener(
    "load",
    () => {
      // WHY: Registration failure must never break the app; the app works without it.
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    },
    { once: true }
  );
}
