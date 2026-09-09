import { spawn } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "five-hour-limit";
const FIVE_HOURS_IN_MINUTES = 300;
const REQUEST_TIMEOUT_MS = 10_000;

interface RateLimitWindow {
	usedPercent: number;
	windowDurationMins: number | null;
	resetsAt: number | null;
}

interface RateLimitResponse {
	rateLimits?: {
		primary?: RateLimitWindow | null;
	};
}

interface RpcMessage {
	id?: number;
	result?: RateLimitResponse;
	error?: { message?: string };
}

function readRateLimit(): Promise<RateLimitWindow> {
	return new Promise((resolve, reject) => {
		const child = spawn("codex", ["app-server", "--stdio", "-c", 'sandbox_mode="danger-full-access"']);
		let output = "";
		let settled = false;

		const finish = (error?: Error, limit?: RateLimitWindow) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			child.kill();
			if (error) reject(error);
			else if (limit) resolve(limit);
			else reject(new Error("Codex returned no 5-hour limit"));
		};

		const timeout = setTimeout(() => finish(new Error("Codex usage request timed out")), REQUEST_TIMEOUT_MS);
		child.on("error", (error) => finish(error));
		child.on("exit", (code) => {
			if (!settled) finish(new Error(`Codex usage process exited with code ${code}`));
		});
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			output += chunk;
			const lines = output.split("\n");
			output = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				const message = JSON.parse(line) as RpcMessage;
				if (message.id === 1) {
					child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
					child.stdin.write(`${JSON.stringify({ method: "account/rateLimits/read", id: 2, params: null })}\n`);
				}
				if (message.id !== 2) continue;
				if (message.error) {
					finish(new Error(message.error.message ?? "Codex usage request failed"));
					continue;
				}
				const limit = message.result?.rateLimits?.primary;
				if (limit?.windowDurationMins === FIVE_HOURS_IN_MINUTES) finish(undefined, limit);
				else finish();
			}
		});

		child.stdin.write(
			`${JSON.stringify({
				method: "initialize",
				id: 1,
				params: { clientInfo: { name: "pi-usage", title: "Pi usage", version: "1" }, capabilities: null },
			})}\n`,
		);
	});
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
		refresh = readRateLimit()
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
