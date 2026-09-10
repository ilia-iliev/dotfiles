import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { alertTerminal, findFootPid, markFootUrgent } from "../terminal-alert.ts";

const extensionDirectory = new URL("../", import.meta.url);

test("uses one terminal-independent bell extension", async () => {
	const extensionFiles = await readdir(extensionDirectory);
	assert.equal(extensionFiles.includes("alacritty-bell.ts"), false);
	assert.equal(extensionFiles.includes("foot-urgent.ts"), false);

	let output = "";
	alertTerminal((value) => {
		output += value;
	});
	assert.equal(output, "\x07");
});

test("detects Foot in the process ancestry and marks its window urgent", () => {
	const files = new Map([
		["/proc/30/comm", "bash\n"],
		["/proc/30/status", "Name:\tbash\nPPid:\t20\n"],
		["/proc/20/comm", "foot\n"],
	]);
	const readProcessFile = (path) => files.get(path);
	assert.equal(findFootPid(30, readProcessFile), 20);

	let invocation;
	markFootUrgent(20, (command, args, options) => {
		invocation = { command, args, options };
		return { unref() {} };
	});
	assert.equal(invocation.command, "swaymsg");
	assert.deepEqual(invocation.args, ["[pid=20]", "urgent", "enable"]);
	assert.equal(invocation.options.detached, true);
});
