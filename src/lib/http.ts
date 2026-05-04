// interlinked-tdd: exempt
import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const BIOGRID_BASE = "https://webservice.thebiogrid.org";

export interface BiogridFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
	baseUrl?: string;
	accessKey?: string;
}

/**
 * Fetch from the BioGRID REST API.
 *
 * BioGRID requires `accesskey=<32-char-key>` on every request. The key is
 * registered for free at https://webservice.thebiogrid.org and supplied to
 * the deployed Worker via `wrangler secret put BIOGRID_ACCESS_KEY`.
 *
 * The adapter never exposes the key to the V8 isolate — Code Mode's
 * `api.get/api.post` route through the host HTTP layer, where the key is
 * appended automatically.
 */
export async function biogridFetch(
	path: string,
	params?: Record<string, unknown>,
	opts?: BiogridFetchOptions,
): Promise<Response> {
	const baseUrl = opts?.baseUrl ?? BIOGRID_BASE;
	const accessKey = opts?.accessKey;
	const mergedParams: Record<string, unknown> = { ...(params ?? {}) };
	if (accessKey && !("accesskey" in mergedParams) && !("accessKey" in mergedParams)) {
		mergedParams.accesskey = accessKey;
	}
	const headers: Record<string, string> = {
		Accept: "application/json",
		...(opts?.headers ?? {}),
	};
	return restFetch(baseUrl, path, mergedParams, {
		...opts,
		headers,
		retryOn: [429, 500, 502, 503],
		retries: opts?.retries ?? 3,
		timeout: opts?.timeout ?? 30_000,
		userAgent: "biogrid-mcp-server/1.0 (bio-mcp)",
	});
}
