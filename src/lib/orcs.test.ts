import { afterEach, expect, it, vi } from "vitest";
import { createOrcsApiFetch } from "./orcs";

const key = "unit-test-orcs-credential";
afterEach(() => vi.unstubAllGlobals());
const screen = { SCREEN_ID: "201", CELL_LINE: "U-343 MG-A cell", ANALYSIS: "CERES", "SCORE.1_TYPE": "CERES score", "SCORE.2_TYPE": "FDR", SIGNIFICANCE_CRITERIA: "Score.2 (FDR) < 0.05" };
const score = { SCREEN_ID: "201", IDENTIFIER_ID: "5977", "SCORE.1": "-0.492155932", "SCORE.3": "-", HIT: "YES" };

it("combines provider-example score and screen context without changing score units or missing markers", async () => {
  const fetcher = vi.fn((url: URL) => Promise.resolve(Response.json(url.pathname === "/screens/" ? [screen] : [score, score])));
  vi.stubGlobal("fetch", fetcher);
  const result = await createOrcsApiFetch(` ${key} `)({ method: "GET", path: "/orcs/screen/201/context", params: { hit: "yes" } });
  expect(result.data).toMatchObject({ screen_context: screen, data: [score, score], filters: { hit: "yes", format: "json" } });
  expect(JSON.stringify(result)).not.toContain(key);
  const urls = fetcher.mock.calls.map(call => call[0]);
  expect(urls.map(url => url.origin)).toEqual(["https://orcsws.thebiogrid.org", "https://orcsws.thebiogrid.org"]);
  expect(urls[0].searchParams.get("screenID")).toBe("201");
  expect(urls[0].searchParams.get("max")).toBe("2");
  expect(urls[1].searchParams.get("hit")).toBe("yes");
  expect(urls.every(url => url.searchParams.get("accesskey") === key)).toBe(true);
});

it("distinguishes an empty successful query from the real HTTP-200 auth-error shape", async () => {
  const api = createOrcsApiFetch(key);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
  expect((await api({ method: "GET", path: "/orcs/screens" })).data).toMatchObject({ data: [] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ STATUS: "ERROR", MESSAGE: "Your Access Key is Not Validly Formatted, or Does Not Exist." })));
  await expect(api({ method: "GET", path: "/orcs/screens" })).rejects.toMatchObject({ status: 401 });
});

it("rejects missing credentials and mutations without an upstream request", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(createOrcsApiFetch()({ method: "GET", path: "/orcs/screens" })).rejects.toThrow("BIOGRID_ORCS_ACCESS_KEY");
  await expect(createOrcsApiFetch(key)({ method: "POST", path: "/orcs/screens" })).rejects.toMatchObject({ status: 405 });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([{ metadata: [] }, { metadata: [screen, screen] }, { metadata: [{ ...screen, SCREEN_ID: "202" }] }])("refuses missing or mismatched screen metadata", async ({ metadata }) => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: URL) => Promise.resolve(Response.json(url.pathname === "/screens/" ? metadata : [score]))));
  await expect(createOrcsApiFetch(key)({ method: "GET", path: "/orcs/screen/201/context" })).rejects.toThrow("context");
});

it("refuses mismatched score rows", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: URL) => Promise.resolve(Response.json(url.pathname === "/screens/" ? [screen] : [{ ...score, SCREEN_ID: "202" }]))));
  await expect(createOrcsApiFetch(key)({ method: "GET", path: "/orcs/screen/201/context" })).rejects.toThrow("score rows");
});

it.each([new Response("redirect", { status: 302 }), new Response("unavailable", { status: 503 }), new Response("<html>"), Response.json({ unexpected: true })])("rejects invalid upstream responses", async response => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(createOrcsApiFetch(key)({ method: "GET", path: "/orcs/screens" })).rejects.toThrow();
});

it("bounds streamed responses and cancels reading", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16_000_001)); }, cancel });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(createOrcsApiFetch(key)({ method: "GET", path: "/orcs/screens" })).rejects.toThrow("16MB");
  expect(cancel).toHaveBeenCalled();
});

it("redacts credentials from provider and transport errors across realms", async () => {
  const api = createOrcsApiFetch(key);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue({ status: 503, message: `Could not fetch ?accesskey=${key}` }));
  await expect(api({ method: "GET", path: "/orcs/screens" })).rejects.toMatchObject({ status: 503, message: "Could not fetch ?accesskey=[REDACTED]" });
});
