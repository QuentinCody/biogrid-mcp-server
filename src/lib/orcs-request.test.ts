import { expect, it } from "vitest";
import { buildOrcsRequest } from "./orcs-request";

it("supports the provider's HeLa knockout screen example with bounded pagination", () => {
  expect(buildOrcsRequest("/orcs/screens/", { cellLine: "hela", libraryMethodology: "knockout", max: 25, start: 50 })).toEqual({
    path: "/screens/", params: { cellLine: "hela", libraryMethodology: "knockout", max: 25, start: 50, format: "json" },
  });
});

it("preserves documented score filters and multi-gene identifiers", () => {
  expect(buildOrcsRequest("/orcs/genes", { geneID: "1021|1022", hit: "yes", score1Min: -0.995 })).toMatchObject({
    path: "/genes/", params: { geneID: "1021|1022", hit: "yes", score1Min: -0.995, format: "json" },
  });
  expect(buildOrcsRequest("/orcs/screen/178/context", { score1Min: 0.9, score1Max: 0.98 })).toMatchObject({ path: "/screen/178", contextId: "178" });
});

it.each([
  ["/orcs/screens", { max: 10001 }], ["/orcs/screens", { start: -1 }],
  ["/orcs/screens", { cellline: "misspelled" }], ["/orcs/screens", { accesskey: "caller-secret" }],
  ["/orcs/screens", { format: "tab" }], ["/orcs/genes", {}],
  ["/orcs/screen/1", { score1Min: Number.POSITIVE_INFINITY }], ["/orcs/screen/1", { score6Min: 1 }],
  ["/orcs/gene/1", { geneID: "2" }], ["/orcs/gene/1/context", {}],
  ["/orcs/vocab/../screens", {}], ["/orcs/screen/0", {}], ["https://example.org/orcs/screens", {}],
  ["/orcs/genes", { geneID: "1|" }], ["/orcs/genes", { geneID: `${"1".repeat(1998)}|x` }],
])("rejects unsupported or unsafe requests %s %j", (path, params) => {
  expect(() => buildOrcsRequest(path, params)).toThrow();
});

it.each(["/orcs/organisms", "/orcs/vocabs", "/orcs/vocab/10", "/orcs/gene/1021"])("routes %s with JSON forced", path => {
  expect(buildOrcsRequest(path).params).toEqual({ format: "json" });
});
