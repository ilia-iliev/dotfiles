import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const IDLE_MS = 60 * 60 * 1_000;
const MIN_CONTEXT_TOKENS = 100_000;

export default function (pi: ExtensionAPI): void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let unsubscribeInput: (() => void) | undefined;
	let active = false;
	let compacting = false;

	function clearTimer(): void {
		clearTimeout(timer);
		timer = undefined;
	}

	function restartTimer(ctx: ExtensionContext): void {
		clearTimer();
		if (!active || compacting || !ctx.isIdle()) return;

		timer = setTimeout(() => {
			timer = undefined;
			if (!active || compacting || !ctx.isIdle() || ctx.hasPendingMessages()) return;
			if ((ctx.getContextUsage()?.tokens ?? 0) <= MIN_CONTEXT_TOKENS) return;

			compacting = true;
			ctx.ui.notify("Compacting after 1 hour idle (context over 100k tokens)", "info");
			ctx.compact({
				onComplete: () => {
					compacting = false;
				},
				onError: (error) => {
					compacting = false;
					if (active) ctx.ui.notify(`Idle compaction failed: ${error.message}`, "error");
				},
			});
		}, IDLE_MS);
		timer.unref();
	}

	pi.on("session_start", (_event, ctx) => {
		active = ctx.mode === "tui" || ctx.mode === "rpc";
		if (ctx.mode === "tui") {
			unsubscribeInput = ctx.ui.onTerminalInput(() => {
				restartTimer(ctx);
			});
		}
		restartTimer(ctx);
	});

	pi.on("input", (_event, ctx) => restartTimer(ctx));
	pi.on("before_agent_start", clearTimer);
	pi.on("agent_start", clearTimer);
	// agent_end can be followed by retries or queued work; wait for final idle.
	pi.on("agent_settled", (_event, ctx) => restartTimer(ctx));
	pi.on("session_tree", (_event, ctx) => restartTimer(ctx));
	pi.on("model_select", (_event, ctx) => restartTimer(ctx));

	pi.on("session_before_compact", () => {
		compacting = true;
		clearTimer();
	});
	pi.on("session_compact", (_event, ctx) => {
		compacting = false;
		restartTimer(ctx);
	});
	pi.on("session_compact_failed", () => {
		compacting = false;
		clearTimer();
	});

	pi.on("session_shutdown", () => {
		active = false;
		clearTimer();
		unsubscribeInput?.();
		unsubscribeInput = undefined;
	});
}
