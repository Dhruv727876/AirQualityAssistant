import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApiError,
  getHealth,
  searchLocations,
  createPlan,
} from "./api";
import { sampleProfile, samplePlan } from "./testData";
import { jsonResponse, stubFetch } from "./testUtils";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a valid plan parses", async () => {
    stubFetch(jsonResponse(samplePlan));

    const plan = await createPlan(sampleProfile);
    expect(plan).toEqual(samplePlan);
  });

  it("a plan with a wrong shape throws BAD_RESPONSE", async () => {
    stubFetch(jsonResponse({ unexpected: "data" }));

    await expect(createPlan(sampleProfile)).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });

  it("a server error envelope maps to its code", async () => {
    stubFetch(
      jsonResponse(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Invalid profile data",
          },
        },
        400
      )
    );

    await expect(createPlan(sampleProfile)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Invalid profile data",
    });
  });

  it("a non-envelope 500 maps to UPSTREAM", async () => {
    stubFetch(new Response("Internal Server Error", { status: 500 }));

    await expect(getHealth()).rejects.toMatchObject({
      code: "UPSTREAM",
    });
  });

  it("a rejected fetch maps to NETWORK", async () => {
    stubFetch(Promise.reject(new Error("Network connection dropped")));

    await expect(getHealth()).rejects.toMatchObject({
      code: "NETWORK",
      message: "Network connection dropped",
    });
  });

  it("a fetch rejecting with an AbortError rejects with name AbortError and is not an ApiError", async () => {
    stubFetch(Promise.reject(new DOMException("aborted", "AbortError")));

    let thrown: unknown = null;
    try {
      await getHealth();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toMatchObject({ name: "AbortError" });
    expect(thrown instanceof ApiError).toBe(false);
  });

  it("searchLocations parses a result list and an empty one", async () => {
    const placesResponse = {
      results: [
        {
          name: "London",
          latitude: 51.5074,
          longitude: -0.1278,
          country: "United Kingdom",
          region: "England",
        },
      ],
    };

    stubFetch(jsonResponse(placesResponse));

    const found = await searchLocations("London");
    expect(found.results).toEqual(placesResponse.results);

    stubFetch(jsonResponse({ results: [] }));

    const empty = await searchLocations("Nowhere");
    expect(empty.results).toEqual([]);
  });

  it("the request URL contains the encoded query", async () => {
    const fetchMock = stubFetch(jsonResponse({ results: [] }));

    await searchLocations("New York & London");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("q=New%20York%20%26%20London"),
      expect.anything()
    );
  });

  it("createPlan sends a JSON body with a Content-Type header", async () => {
    const fetchMock = stubFetch(jsonResponse(samplePlan));

    await createPlan(sampleProfile);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/plan"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sampleProfile),
      })
    );
  });
});
