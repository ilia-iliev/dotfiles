import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";

import { orderSupplementalStats } from "../lib/footer-stats.ts";

const piDirectory = resolve(dirname(process.execPath), "../lib/node_modules/@earendil-works/pi-coding-agent");
const piRequire = createRequire(resolve(piDirectory, "package.json"));
const { createJiti } = piRequire("jiti");
const jiti = createJiti(import.meta.url, {
	alias: { "@earendil-works/pi-tui": piRequire.resolve("@earendil-works/pi-tui") },
});
const { default: decodeSpeed } = await jiti.import("../decode-speed.ts");

function renderContext(usage) {
	const handlers = new Map();
	let footer;
	decodeSpeed({ on: (name, handler) => handlers.set(name, handler) });
	handlers.get("session_start")({}, {
		mode: "tui",
		cwd: process.cwd(),
		model: { id: "test-model", contextWindow: 500_000 },
		getContextUsage: () => usage,
		sessionManager: { getEntries: () => [], getSessionName: () => undefined },
		ui: {
			setFooter: (factory) => {
				footer = factory(
					{ requestRender() {} },
					{ fg: (color, text) => color === "dim" ? text : `<${color}>${text}</${color}>` },
					{
						onBranchChange: () => () => {},
						getExtensionStatuses: () => new Map(),
						getGitBranch: () => undefined,
					},
				);
			},
		},
	});
	return footer.render(200)[1];
}

for (const [tokens, expected] of [[0, "0k"], [999, "0k"], [1_999, "1k"], [15_999, "15k"], [150_999, "150k"], [1_234_567, "1234k"]]) {
	test(`shows ${tokens} context tokens as ${expected}`, () => {
		const line = renderContext({ tokens, contextWindow: 20_000_000, percent: tokens / 200_000 });
		assert.ok(line.startsWith(`${expected} `), line);
		assert.doesNotMatch(line, /%|\//);
	});
}

for (const usage of [undefined, { tokens: null, contextWindow: 500_000, percent: null }]) {
	test(`shows unknown context as ? (${JSON.stringify(usage)})`, () => {
		const line = renderContext(usage);
		assert.ok(line.startsWith("? "), line);
		assert.doesNotMatch(line, /%|\//);
	});
}

for (const [percent, color] of [[50, "warning"], [90, "error"]]) {
	test(`preserves ${color} context colouring at ${percent}% used`, () => {
		const tokens = percent * 5_000;
		assert.ok(renderContext({ tokens, contextWindow: 500_000, percent }).includes(`<${color}>${tokens / 1_000}k</${color}>`));
	});
}

test("puts the continuation status after price and decode speed", () => {
	assert.deepEqual(
		orderSupplementalStats("$1.40", "↓ 12.3 tok/s", "5% 21:31 → continue"),
		["$1.40", "↓ 12.3 tok/s", "5% 21:31 → continue"],
	);
});
