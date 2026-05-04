// interlinked-tdd: exempt
import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { biogridFetch } from "./http";

/**
 * BioGRID returns interactions as a JSON OBJECT keyed by BioGRID interaction
 * ID (e.g. {"103": {...}, "104": {...}}). For staging to work cleanly we
 * normalize this into an ARRAY when the response shape matches that pattern.
 *
 * Other endpoints (`/organisms/`, `/identifiers/`, `/evidence/`,
 * `/version/`) return their own shapes which we leave alone.
 */
function normalizeInteractionsObject(data: unknown): unknown {
	if (!data || typeof data !== "object" || Array.isArray(data)) return data;
	const obj = data as Record<string, unknown>;
	const keys = Object.keys(obj);
	if (keys.length === 0) return data;
	// Heuristic: every value is an object containing BIOGRID_INTERACTION_ID,
	// or every key is a numeric BioGRID ID.
	const allValuesAreInteractions = keys.every((k) => {
		const v = obj[k];
		if (!v || typeof v !== "object" || Array.isArray(v)) return false;
		const r = v as Record<string, unknown>;
		return (
			"BIOGRID_INTERACTION_ID" in r ||
			"OFFICIAL_SYMBOL_A" in r ||
			"ENTREZ_GENE_A" in r
		);
	});
	if (!allValuesAreInteractions) return data;
	return Object.entries(obj).map(([id, row]) => ({
		BIOGRID_INTERACTION_ID:
			(row as Record<string, unknown>).BIOGRID_INTERACTION_ID ?? Number(id),
		...(row as Record<string, unknown>),
	}));
}

interface BiogridApiAdapterEnv {
	BIOGRID_ACCESS_KEY?: string;
}

export function createBiogridApiFetch(env?: BiogridApiAdapterEnv): ApiFetchFn {
	const accessKey = env?.BIOGRID_ACCESS_KEY;
	return async (request) => {
		const response = await biogridFetch(request.path, request.params, {
			accessKey,
		});

		// BioGRID returns 401 with a structured JSON body when the key is
		// missing/invalid — surface this as a clean error.
		if (!response.ok) {
			let errorBody: string;
			let parsed: unknown;
			try {
				errorBody = await response.text();
				try {
					parsed = JSON.parse(errorBody);
				} catch {
					parsed = errorBody;
				}
			} catch {
				errorBody = response.statusText;
				parsed = errorBody;
			}
			const error = new Error(
				`HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
			) as Error & { status: number; data: unknown };
			error.status = response.status;
			error.data = parsed;
			throw error;
		}

		const contentType = response.headers.get("content-type") || "";
		if (!contentType.includes("json")) {
			const text = await response.text();
			return { status: response.status, data: { text } };
		}

		const data = await response.json();
		// Normalize interactions endpoints (the only ones that return
		// keyed-by-id objects). Path-based gating avoids surprising callers
		// who hit other endpoints.
		const path = request.path.toLowerCase();
		const isInteractionsEndpoint =
			path.startsWith("/interactions") || path.startsWith("interactions");
		const normalized = isInteractionsEndpoint
			? normalizeInteractionsObject(data)
			: data;
		return { status: response.status, data: normalized };
	};
}
