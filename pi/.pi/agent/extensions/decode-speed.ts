import { relative, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

function formatTokens(count: number): string {
	if (count < 1_000) return `${count}`;
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function footerPath(cwd: string): string {
	const home = process.env.HOME;
	if (!home) return cwd;

	const path = relative(resolve(home), resolve(cwd));
	if (path === "") return "~";
	if (path === ".." || path.startsWith(`..${sep}`)) return cwd;
	return `~${sep}${path}`;
}

function totals(ctx: ExtensionContext): { totals: UsageTotals; cacheHitRate?: number } {
	const result: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	let cacheHitRate: number | undefined;

	for (const entry of ctx.sessionManager.getEntries()) {
		const usage = entry.type === "message" ? entry.message.usage : entry.usage;
		if (!usage) continue;

		result.input += usage.input;
		result.output += usage.output;
		result.cacheRead += usage.cacheRead;
		result.cacheWrite += usage.cacheWrite;
		result.cost += usage.cost.total;

		if (entry.type === "message" && entry.message.role === "assistant") {
			const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
			cacheHitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined;
		}
	}

	return { totals: result, cacheHitRate };
}

export default function (pi: ExtensionAPI): void {
	let totalTokens = 0;
	let totalMs = 0;
	let startMs: number | null = null;
	let requestRender: (() => void) | undefined;

	const refresh = () => requestRender?.();
	const decodeSpeed = () => (totalMs > 0 ? totalTokens / (totalMs / 1_000) : 0);

	pi.on("session_start", (_event, ctx) => {
		totalTokens = 0;
		totalMs = 0;
		startMs = null;

		if (ctx.mode !== "tui") return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsubscribe = footerData.onBranchChange(refresh);

			return {
				dispose: () => {
					unsubscribe();
					requestRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const { totals: usage, cacheHitRate } = totals(ctx);
					const stats = [];
					if (usage.input) stats.push(`↑${formatTokens(usage.input)}`);
					if (usage.output) stats.push(`↓${formatTokens(usage.output)}`);
					if (usage.cacheWrite) stats.push(`W${formatTokens(usage.cacheWrite)}`);
					if (cacheHitRate !== undefined) stats.push(`CH${cacheHitRate.toFixed(1)}%`);
					if (usage.cost) stats.push(`$${usage.cost.toFixed(2)}`);

					const context = ctx.getContextUsage();
					const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPercent = context?.percent;
					const contextText = contextPercent === null || contextPercent === undefined
						? `?/${formatTokens(contextWindow)}`
						: `${Math.round(contextPercent)}%/${formatTokens(contextWindow)}`;
					stats.push(
						contextPercent !== undefined && contextPercent !== null && contextPercent > 90
							? theme.fg("error", contextText)
							: contextPercent !== undefined && contextPercent !== null && contextPercent > 70
								? theme.fg("warning", contextText)
								: contextText,
					);

					const speed = decodeSpeed();
					if (startMs !== null) stats.push("↓ … tok/s");
					else if (speed > 0) stats.push(`↓ ${speed.toFixed(1)} tok/s`);
					stats.push(...footerData.getExtensionStatuses().values());

					let left = stats.join(" ");
					const model = ctx.model?.id ?? "no-model";
					if (visibleWidth(left) > width) left = truncateToWidth(left, width, "...");
					const availableForModel = width - visibleWidth(left) - 2;
					const right = availableForModel > 0 ? truncateToWidth(model, availableForModel, "") : "";
					const padding = " ".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right)));

					let path = footerPath(ctx.cwd);
					const branch = footerData.getGitBranch();
					if (branch) path += ` (${branch})`;
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) path += ` • ${sessionName}`;

					return [
						truncateToWidth(theme.fg("dim", path), width, theme.fg("dim", "...")),
						truncateToWidth(theme.fg("dim", left + padding + right), width),
					];
				},
			};
		});
	});

	pi.on("message_start", (event) => {
		if (event.message.role !== "assistant") return;
		startMs = Date.now();
		refresh();
	});

	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant" || startMs === null) return;
		totalMs += Date.now() - startMs;
		startMs = null;
		totalTokens += event.message.usage?.output ?? 0;
		refresh();
	});
}
