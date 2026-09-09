import { Buffer } from "node:buffer";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "five-hour-limit";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const FIVE_HOURS_IN_MINUTES = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

interface RateLimitWindow {
	usedPercent: number;
	windowDurationMins: number | null;
	resetsAt: number | null;
}

interface UsageResponse {
	rate_limit?: {
		primary_window?: {
			used_percent?: number;
			limit_window_seconds?: number;
			reset_at?: number;
		} | null;
	};
}

function accountIdFromToken(accessToken: string): string {
	const payload = accessToken.split(".")[1];
	if (!payload) throw new Error("OpenAI OAuth token is not a JWT");
	const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
		[JWT_CLAIM_PATH]?: { chatgpt_account_id?: string };
	};
	const accountId = claims[JWT_CLAIM_PATH]?.chatgpt_account_id;
	if (!accountId) throw new Error("OpenAI OAuth token has no account ID");
	return accountId;
}

export async function fetchRateLimit(
	accessToken: string,
	fetcher: typeof fetch = fetch,
): Promise<RateLimitWindow> {
	const response = await fetcher(USAGE_URL, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${accessToken}`,
			"ChatGPT-Account-Id": accountIdFromToken(accessToken),
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`OpenAI usage request failed with status ${response.status}`);

	const usage = await response.json() as UsageResponse;
	const window = usage.rate_limit?.primary_window;
	if (typeof window?.used_percent !== "number" || typeof window.limit_window_seconds !== "number") {
		throw new Error("OpenAI returned no 5-hour limit");
	}
	if (window.limit_window_seconds / 60 !== FIVE_HOURS_IN_MINUTES) {
		throw new Error("OpenAI returned an unexpected primary limit window");
	}
	return {
		usedPercent: window.used_percent,
		windowDurationMins: FIVE_HOURS_IN_MINUTES,
		resetsAt: typeof window.reset_at === "number" ? window.reset_at : null,
	};
}

async function readRateLimit(ctx: ExtensionContext): Promise<RateLimitWindow> {
	const auth = await ctx.modelRegistry.getProviderAuth("openai-codex");
	const accessToken = auth?.auth.apiKey;
	if (!accessToken) throw new Error("OpenAI Codex is not authenticated in Pi");
	return fetchRateLimit(accessToken);
}

function showRateLimit(limit: RateLimitWindow, ctx: ExtensionContext): void {
	const remaining = Math.max(0, Math.min(100, Math.round(100 - limit.usedPercent)));
	const color = remaining <= 10 ? "error" : remaining <= 30 ? "warning" : "dim";
	const reset = limit.resetsAt === null ? "--:--" : new Date(limit.resetsAt * 1_000).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const percentage = ctx.ui.theme.fg(color, `${remaining}%`);
	ctx.ui.setStatus(STATUS_ID, `${percentage} ${ctx.ui.theme.fg("dim", reset)}`);
}

export default function (pi: ExtensionAPI) {
	let refresh: Promise<void> | undefined;
	let warned = false;

	function refreshRateLimit(ctx: ExtensionContext): Promise<void> {
		if (refresh) return refresh;
		refresh = readRateLimit(ctx)
			.then((limit) => {
				showRateLimit(limit, ctx);
				warned = false;
			})
			.catch((error: Error) => {
				if (!warned) ctx.ui.notify(`Could not read Codex usage: ${error.message}`, "warning");
				warned = true;
			})
			.finally(() => {
				refresh = undefined;
			});
		return refresh;
	}

	pi.on("session_start", async (_event, ctx) => refreshRateLimit(ctx));
	pi.on("tool_execution_end", async (_event, ctx) => refreshRateLimit(ctx));
	pi.on("agent_settled", async (_event, ctx) => refreshRateLimit(ctx));
	pi.on("session_shutdown", (_event, ctx) => ctx.ui.setStatus(STATUS_ID, undefined));
}
