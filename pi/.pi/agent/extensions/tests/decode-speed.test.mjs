import assert from "node:assert/strict";
import test from "node:test";

import { orderSupplementalStats } from "../lib/footer-stats.ts";

test("puts the continuation status after price and decode speed", () => {
	assert.deepEqual(
		orderSupplementalStats("$1.40", "↓ 12.3 tok/s", "5% 21:31 → continue"),
		["$1.40", "↓ 12.3 tok/s", "5% 21:31 → continue"],
	);
});
