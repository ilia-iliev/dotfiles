import assert from "node:assert/strict";
import test from "node:test";

import { fetchRateLimit } from "../five-hour-limit.ts";

function accessToken(accountId) {
	const payload = Buffer.from(JSON.stringify({
		"https://api.openai.com/auth": { chatgpt_account_id: accountId },
	})).toString("base64url");
	return `header.${payload}.signature`;
}

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
