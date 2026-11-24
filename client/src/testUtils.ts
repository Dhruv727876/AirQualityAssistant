import { vi } from "vitest";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function stubFetch(response: Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function stubFetchRoutes(routes: Record<string, () => Response | Promise<Response>>): void {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    for (const [key, handler] of Object.entries(routes)) {
      if (url.includes(key)) {
        return Promise.resolve(handler());
      }
    }
    if (url.includes("/api/health")) {
      return Promise.resolve(jsonResponse({ status: "ok", uptimeSeconds: 5 }));
    }
    return Promise.reject(new Error(`Unhandled route: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
}
