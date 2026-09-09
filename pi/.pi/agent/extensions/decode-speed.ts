import { relative, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

function totalCost(ctx: ExtensionContext): number {
	let cost = 0;
	for (const entry of ctx.sessionManager.getEntries()) {
		const usage = entry.type === "message" ? entry.message.usage : entry.usage;
		if (usage) cost += usage.cost.total;
	}
	return cost;
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
					const stats = [];
					const context = ctx.getContextUsage();
					const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPercent = context?.percent;
					const contextText = contextPercent === null || contextPercent === undefined
						? `?/${formatTokens(contextWindow)}`
						: `${Math.round(contextPercent)}%/${formatTokens(contextWindow)}`;
					stats.push(
						contextPercent !== undefined && contextPercent !== null && contextPercent >= 90
							? theme.fg("error", contextText)
							: contextPercent !== undefined && contextPercent !== null && contextPercent >= 50
								? theme.fg("warning", contextText)
								: contextText,
					);

					const limit = footerData.getExtensionStatuses().get("five-hour-limit");
					if (limit) stats.push(limit);
					stats.push(theme.fg("dim", `$${totalCost(ctx).toFixed(2)}`));

					const speed = decodeSpeed();
					if (speed > 0) stats.push(theme.fg("dim", `↓ ${speed.toFixed(1)} tok/s`));
					else if (startMs !== null) stats.push(theme.fg("dim", "↓ … tok/s"));

					let left = stats.join(" ");
					const model = theme.fg("dim", ctx.model?.id ?? "no-model");
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

	pi.on("tool_execution_end", refresh);
}
