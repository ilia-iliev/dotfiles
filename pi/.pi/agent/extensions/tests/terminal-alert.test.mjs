import assert from "node:assert/strict";
import test from "node:test";

import { resolveTerminalTarget, sendNotification } from "../terminal-alert.ts";

test("targets the Alacritty window attached to this tmux session", () => {
	const files = new Map([
		["/proc/86339/environ", "TERM=alacritty\0ALACRITTY_WINDOW_ID=67108869\0"],
	]);
	const target = resolveTerminalTarget(
		{ ALACRITTY_WINDOW_ID: "2097157", TMUX: "/tmp/tmux/default,4518,3" },
		() => "86339\n",
		(path) => files.get(path),
	);
	assert.deepEqual(target, {
		command: "xdotool",
		args: ["set_window", "--urgency", "1", "67108869"],
	});
});

test("targets Foot through the tmux client's process ancestry", () => {
	const files = new Map([
		["/proc/30/environ", "TERM=foot\0"],
		["/proc/30/comm", "bash\n"],
		["/proc/30/status", "Name:\tbash\nPPid:\t20\n"],
		["/proc/20/comm", "foot\n"],
	]);
	const target = resolveTerminalTarget(
		{ TMUX: "/tmp/tmux/default,1,1" },
		() => "30\n",
		(path) => files.get(path),
	);
	assert.deepEqual(target, {
		command: "swaymsg",
		args: ["[pid=20]", "urgent", "enable"],
	});
});

test("sends only the targeted notification", () => {
	let invocation;
	sendNotification(
		{ command: "xdotool", args: ["set_window", "--urgency", "1", "42"] },
		(command, args, options) => {
			invocation = { command, args, options };
			return { unref() {} };
		},
	);
	assert.deepEqual(invocation, {
		command: "xdotool",
		args: ["set_window", "--urgency", "1", "42"],
		options: { detached: true, stdio: "ignore" },
	});
});
