// interlinked-tdd: exempt

/**
 * BioGRID access-key preflight.
 *
 * Every BioGRID REST endpoint is gated behind a free 32-character `accesskey`
 * — including the `/version/`, `/organisms/`, `/identifiers/` and `/evidence/`
 * metadata helpers, which 302 to the registration page when the key is absent.
 * With `BIOGRID_ACCESS_KEY` unset the upstream answers:
 *
 *   HTTP 401 {"STATUS":"ERROR","MESSAGES":["Your Access Key is Not Validly
 *   Formatted. ..."],"TYPE":"UNAUTHORIZED ACCESS"}
 *
 * That body names no environment variable and no install step, so a model that
 * reads it cannot act on it. We fail BEFORE the request with the env var name,
 * the registration URL and the exact `wrangler secret put` command.
 *
 * This is still a hard failure and stays one: the thrown error carries
 * `status: 401`, so the Code Mode api-proxy reports `__api_error` and
 * `biogrid_execute` returns `isError: true` / `structuredContent.success:
 * false`. Nothing here downgrades an upstream error to a success, and no
 * substitute data is synthesized.
 */

export const BIOGRID_ACCESS_KEY_ENV = "BIOGRID_ACCESS_KEY";
export const BIOGRID_REGISTRATION_URL = "https://webservice.thebiogrid.org/";
export const BIOGRID_SECRET_COMMAND =
	"cd servers/biogrid-mcp-server && npx wrangler secret put BIOGRID_ACCESS_KEY";

export const BIOGRID_MISSING_KEY_CODE = "BIOGRID_ACCESS_KEY_MISSING";
export const BIOGRID_REJECTED_KEY_CODE = "BIOGRID_ACCESS_KEY_REJECTED";

/** Error shape the api-adapter throws; `status`/`data` reach the isolate verbatim. */
export type BiogridApiError = Error & { status: number; data: unknown };

export interface BiogridAccessKeyRemediation {
	code: string;
	message: string;
	env_var: string;
	registration_url: string;
	install_command: string;
	steps: string[];
	/** What is and is not available without a key — stated so nothing looks silently substituted. */
	keyless_note: string;
}

const REGISTRATION_STEPS = [
	`1. Open ${BIOGRID_REGISTRATION_URL} and fill in firstname / lastname / email / project.`,
	"2. Click 'Generate Access Key'. The 32-character key is issued inline, free, with no approval queue.",
	`3. Install it as a Worker secret: ${BIOGRID_SECRET_COMMAND}`,
	"4. Redeploy (`pnpm --filter biogrid-mcp-server run deploy`) so the running Worker picks the secret up.",
];

const KEYLESS_NOTE =
	"No BioGRID REST endpoint answers without a key. BioGRID does publish keyless MIT-licensed bulk " +
	"files at https://downloads.thebiogrid.org, but the interaction corpus is ~173 MB compressed / " +
	"~1.4 GB expanded and cannot be loaded inside a Worker isolate, so this server does not serve it. " +
	"For keyless human protein-protein edges use the string-db MCP server instead — note it returns " +
	"combined evidence scores, not BioGRID's per-publication PMIDs or experimental-system labels.";

/** Trim and reject blank/whitespace-only secrets — an empty secret is an unset secret. */
export function normalizeAccessKey(raw: string | undefined): string | undefined {
	const trimmed = raw?.trim();
	return trimmed ? trimmed : undefined;
}

export function buildAccessKeyRemediation(
	code: string,
	message: string,
): BiogridAccessKeyRemediation {
	return {
		code,
		message,
		env_var: BIOGRID_ACCESS_KEY_ENV,
		registration_url: BIOGRID_REGISTRATION_URL,
		install_command: BIOGRID_SECRET_COMMAND,
		steps: REGISTRATION_STEPS,
		keyless_note: KEYLESS_NOTE,
	};
}

/**
 * The preflight failure raised when no key is configured. Thrown instead of
 * issuing a request we already know the upstream will reject.
 */
export function missingAccessKeyError(): BiogridApiError {
	const remediation = buildAccessKeyRemediation(
		BIOGRID_MISSING_KEY_CODE,
		`The BioGRID REST API requires an access key on every request and ${BIOGRID_ACCESS_KEY_ENV} is not set on this Worker. No request was sent.`,
	);
	const error = new Error(
		`HTTP 401: ${remediation.message} Register (free, instant) at ${BIOGRID_REGISTRATION_URL} then run: ${BIOGRID_SECRET_COMMAND}`,
	) as BiogridApiError;
	error.status = 401;
	error.data = { error: remediation };
	return error;
}

/**
 * Attach the same remediation to an upstream 401/403 — a key IS configured but
 * BioGRID rejected it (unregistered, revoked, or malformed). The upstream body
 * is preserved alongside, never replaced.
 */
export function rejectedAccessKeyRemediation(
	status: number,
): BiogridAccessKeyRemediation | undefined {
	if (status !== 401 && status !== 403) return undefined;
	return buildAccessKeyRemediation(
		BIOGRID_REJECTED_KEY_CODE,
		`BioGRID rejected the configured ${BIOGRID_ACCESS_KEY_ENV}. A key must be a 32-character alphanumeric string issued by BioGRID; keys are also invalidated for API abuse. Re-register and reinstall the secret.`,
	);
}
