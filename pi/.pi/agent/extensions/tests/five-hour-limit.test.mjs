import assert from "node:assert/strict";
import test from "node:test";

import fiveHourLimit, { createContinuationScheduler, fetchRateLimit, isUsageLimitError } from "../five-hour-limit.ts";

function accessToken(accountId) {
	const payload = Buffer.from(JSON.stringify({
		"https://api.openai.com/auth": { chatgpt_account_id: accountId },
	})).toString("base64url");
	return `header.${payload}.signature`;
}

async function withStartupContext(run) {
	const originalFetch = globalThis.fetch;
	const handlers = new Map();
	const requests = [];
	const statuses = [];
	const warnings = [];
	const branch = [];
	const model = { provider: "openai-codex", id: "gpt-5.4" };
	const unused = { used_percent: 0, limit_window_seconds: 18_000, reset_at: 1_800_000_000 };
	let usage = unused;
	const ctx = {
		mode: "tui",
		model,
		isIdle: () => true,
		sessionManager: { getBranch: () => branch },
		modelRegistry: {
			getProviderAuth: async () => ({ auth: { apiKey: accessToken("account-123") } }),
			streamSimple: (selectedModel, context, options) => {
				requests.push({ selectedModel, context, options });
				usage = { ...unused, used_percent: 1, reset_at: 1_800_000_100 };
				return { result: async () => ({ stopReason: "stop", content: [] }) };
			},
		},
		ui: {
			theme: { fg: (_color, text) => text },
			setStatus: (_id, text) => statuses.push(text),
			notify: (text) => warnings.push(text),
		},
	};
	globalThis.fetch = async () => new Response(JSON.stringify({ rate_limit: { primary_window: usage } }));
	fiveHourLimit({
		on: (name, handler) => handlers.set(name, handler),
		sendUserMessage: () => assert.fail("The startup request must not enter Pi's conversation"),
		sendMessage: () => assert.fail("The startup response must not enter Pi's conversation"),
		appendEntry: () => assert.fail("The startup request must not be persisted"),
	});
	try {
		await run({ ctx, handlers, requests, statuses, warnings, branch, setUsage: (value) => { usage = value; } });
	} finally {
		globalThis.fetch = originalFetch;
	}
}

test("starts unused quota with an isolated request on empty TUI startup and re-reads usage", async () => {
	await withStartupContext(async ({ ctx, handlers, requests, statuses, warnings }) => {
		await handlers.get("session_start")({}, ctx);
		assert.equal(requests.length, 1);
		assert.equal(requests[0].selectedModel, ctx.model);
		assert.equal(requests[0].context.messages.length, 1);
		assert.equal(requests[0].context.messages[0].role, "user");
		assert.equal(requests[0].context.tools, undefined);
		assert.equal(requests[0].options.maxTokens, 1);
		assert.equal(requests[0].options.reasoning, undefined);
		assert.equal(requests[0].options.toolChoice, "none");
		assert.equal(requests[0].options.transport, "sse");
		assert.equal(requests[0].options.sessionId, undefined);
		assert.ok(requests[0].options.signal instanceof AbortSignal);
		assert.equal(statuses.length, 1);
		assert.match(statuses[0], /^1% /);
		assert.deepEqual(warnings, []);
		await handlers.get("tool_execution_end")({}, ctx);
		await handlers.get("agent_settled")({}, ctx);
		assert.equal(requests.length, 1);
	});
});

test("shows percent used with warning and error colours as the window fills", async () => {
	for (const [used, displayed, color] of [
		[-1, 0, "dim"], [0, 0, "dim"], [42, 42, "dim"], [69, 69, "dim"],
		[70, 70, "warning"], [89, 89, "warning"], [90, 90, "error"],
		[100, 100, "error"], [101, 100, "error"],
	]) {
		await withStartupContext(async ({ ctx, handlers, statuses, setUsage }) => {
			const colours = [];
			ctx.ui.theme.fg = (colour, text) => {
				colours.push(colour);
				return text;
			};
			setUsage({ used_percent: used, limit_window_seconds: 18_000, reset_at: 1_800_000_000 });
			await handlers.get("tool_execution_end")({}, ctx);
			assert.ok(statuses[0].startsWith(`${displayed}% `), `${used}: ${statuses[0]}`);
			assert.equal(colours[0], color, `${used}% used`);
		});
	}
});

test("does not send a startup request for used quota, resumed conversations, other providers or non-TUI modes", async () => {
	for (const scenario of ["used", "resumed", "compacted", "busy", "other-provider", "no-model", "print", "rpc"]) {
		await withStartupContext(async ({ ctx, handlers, requests, branch, setUsage }) => {
			if (scenario === "used") setUsage({ used_percent: 42, limit_window_seconds: 18_000, reset_at: 1_800_000_000 });
			if (scenario === "resumed") branch.push({ type: "message", message: { role: "user", content: "Hello" } });
			if (scenario === "compacted") branch.push({ type: "compaction" });
			if (scenario === "other-provider") ctx.model = { provider: "anthropic" };
			if (scenario === "no-model") ctx.model = undefined;
			if (scenario === "busy") ctx.isIdle = () => false;
			if (scenario === "print" || scenario === "rpc") ctx.mode = scenario;
			await handlers.get("session_start")({}, ctx);
			assert.equal(requests.length, 0, scenario);
		});
	}
});

test("reports startup request failures without displaying the unstarted window", async () => {
	await withStartupContext(async ({ ctx, handlers, statuses, warnings }) => {
		ctx.modelRegistry.streamSimple = () => ({
			result: async () => ({ stopReason: "error", errorMessage: "WebSocket error" }),
		});
		await handlers.get("session_start")({}, ctx);
		assert.deepEqual(statuses, []);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /WebSocket error/);
	});
});

test("schedules only one continue prompt, ever, three minutes after reset", () => {
	const timers = [];
	const prompts = [];
	const scheduler = createContinuationScheduler(
		() => prompts.push("continue"),
		() => 1_000_000,
		(callback, delay) => {
			timers.push({ callback, delay, cancelled: false });
			return timers.length - 1;
		},
		(id) => {
			timers[id].cancelled = true;
		},
	);

	scheduler.schedule({ usedPercent: 42, windowDurationMins: 300, resetsAt: 2_000 });
	scheduler.schedule({ usedPercent: 95, windowDurationMins: 300, resetsAt: 2_000 });

	assert.equal(timers.length, 1);
	assert.equal(timers[0].delay, 1_180_000);
	assert.equal(scheduler.scheduledFor(), 2_180_000);
	timers[0].callback();
	timers[0].callback();
	assert.deepEqual(prompts, ["continue"]);
	assert.equal(scheduler.scheduledFor(), undefined);

	scheduler.schedule({ usedPercent: 99, windowDurationMins: 300, resetsAt: 3_000 });
	assert.equal(timers.length, 1);
});

test("cancels the continue prompt when the session closes", () => {
	const timers = [];
	const prompts = [];
	const scheduler = createContinuationScheduler(
		() => prompts.push("continue"),
		() => 1_000_000,
		(callback, delay) => {
			timers.push({ callback, delay, cancelled: false });
			return timers.length - 1;
		},
		(id) => {
			timers[id].cancelled = true;
		},
	);

	scheduler.schedule({ usedPercent: 90, windowDurationMins: 300, resetsAt: 2_000 });
	scheduler.stop();

	assert.equal(timers[0].cancelled, true);
	if (!timers[0].cancelled) timers[0].callback();
	assert.deepEqual(prompts, []);
});

test("recognizes only ChatGPT usage-limit errors", () => {
	assert.equal(isUsageLimitError("You have hit your ChatGPT usage limit (plus plan). Try again in ~2 min."), true);
	assert.equal(isUsageLimitError("Codex error: The usage limit has been reached"), true);
	assert.equal(isUsageLimitError("Usage limit exceeded for your plan"), true);
	assert.equal(isUsageLimitError("You've reached your usage limit"), true);
	assert.equal(isUsageLimitError("WebSocket error"), false);
	assert.equal(isUsageLimitError(undefined), false);
});

test("fetches the five-hour limit directly with Pi's OAuth token", async () => {
	let request;
	const fetcher = async (url, init) => {
		request = { url, init };
		return new Response(JSON.stringify({
			rate_limit: {
				primary_window: {
					used_percent: 42,
					limit_window_seconds: 18_000,
					reset_at: 1_800_000_000,
				},
			},
		}));
	};

	const limit = await fetchRateLimit(accessToken("account-123"), fetcher);

	assert.equal(request.url, "https://chatgpt.com/backend-api/wham/usage");
	assert.equal(request.init.headers.Authorization, `Bearer ${accessToken("account-123")}`);
	assert.equal(request.init.headers["ChatGPT-Account-Id"], "account-123");
	assert.deepEqual(limit, {
		usedPercent: 42,
		windowDurationMins: 300,
		resetsAt: 1_800_000_000,
	});
});
