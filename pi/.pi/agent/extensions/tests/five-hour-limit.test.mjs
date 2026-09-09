import assert from "node:assert/strict";
import test from "node:test";

import { createContinuationScheduler, fetchRateLimit } from "../five-hour-limit.ts";

function accessToken(accountId) {
	const payload = Buffer.from(JSON.stringify({
		"https://api.openai.com/auth": { chatgpt_account_id: accountId },
	})).toString("base64url");
	return `header.${payload}.signature`;
}

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

	scheduler.consider({ usedPercent: 90, windowDurationMins: 300, resetsAt: 2_000 });
	scheduler.consider({ usedPercent: 95, windowDurationMins: 300, resetsAt: 2_000 });

	assert.equal(timers.length, 1);
	assert.equal(timers[0].delay, 1_180_000);
	assert.equal(scheduler.scheduledFor(), 2_180_000);
	timers[0].callback();
	timers[0].callback();
	assert.deepEqual(prompts, ["continue"]);
	assert.equal(scheduler.scheduledFor(), undefined);

	scheduler.consider({ usedPercent: 99, windowDurationMins: 300, resetsAt: 3_000 });
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

	scheduler.consider({ usedPercent: 90, windowDurationMins: 300, resetsAt: 2_000 });
	scheduler.stop();

	assert.equal(timers[0].cancelled, true);
	if (!timers[0].cancelled) timers[0].callback();
	assert.deepEqual(prompts, []);
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
