import assert from "node:assert/strict";
import test from "node:test";

import idleCompaction from "../idle-compaction.ts";

const HOUR = 60 * 60 * 1_000;

function setup(t) {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const handlers = new Map();
	const compactions = [];
	const notifications = [];
	let terminalInput;
	let unsubscribed = false;
	const ctx = {
		mode: "tui",
		hasUI: true,
		idle: true,
		pending: false,
		usage: { tokens: 100_001 },
		isIdle: () => ctx.idle,
		hasPendingMessages: () => ctx.pending,
		getContextUsage: () => ctx.usage,
		compact: (options) => compactions.push(options),
		ui: {
			notify: (message, level) => notifications.push({ message, level }),
			onTerminalInput: (handler) => {
				terminalInput = handler;
				return () => { unsubscribed = true; };
			},
		},
	};
	idleCompaction({ on: (name, handler) => handlers.set(name, handler) });
	const emit = (name) => handlers.get(name)?.({}, ctx);
	t.after(() => emit("session_shutdown"));
	return {
		ctx, compactions, notifications, emit,
		type: () => terminalInput?.("x"),
		unsubscribed: () => unsubscribed,
	};
}

test("compacts only after a full idle hour", (t) => {
	const { emit, compactions } = setup(t);
	emit("session_start");
	t.mock.timers.tick(HOUR - 1);
	assert.equal(compactions.length, 0);
	t.mock.timers.tick(1);
	assert.equal(compactions.length, 1);
});

for (const usage of [undefined, { tokens: null }, { tokens: 0 }, { tokens: 100_000 }]) {
	test(`does not compact with context usage ${JSON.stringify(usage)}`, (t) => {
		const { ctx, emit, compactions } = setup(t);
		ctx.usage = usage;
		emit("session_start");
		t.mock.timers.tick(HOUR);
		assert.equal(compactions.length, 0);
	});
}

test("checks current context size when the timer fires", (t) => {
	const { ctx, emit, compactions } = setup(t);
	emit("session_start");
	ctx.usage = { tokens: 50_000 };
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 0);
});

for (const activity of ["input", "session_tree", "model_select", "typing"]) {
	test(`${activity} restarts the idle hour`, (t) => {
		const { emit, type, compactions } = setup(t);
		emit("session_start");
		t.mock.timers.tick(HOUR - 1);
		if (activity === "typing") type();
		else emit(activity);
		t.mock.timers.tick(HOUR - 1);
		assert.equal(compactions.length, 0);
		t.mock.timers.tick(1);
		assert.equal(compactions.length, 1);
	});
}

test("waits an hour after the agent fully settles, not agent_end", (t) => {
	const { ctx, emit, compactions } = setup(t);
	emit("session_start");
	emit("before_agent_start");
	ctx.idle = false;
	emit("agent_start");
	t.mock.timers.tick(HOUR * 2);
	emit("agent_end");
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 0);
	ctx.idle = true;
	emit("agent_settled");
	t.mock.timers.tick(HOUR - 1);
	assert.equal(compactions.length, 0);
	t.mock.timers.tick(1);
	assert.equal(compactions.length, 1);
});

for (const state of ["busy", "pending"]) {
	test(`does not compact while ${state}`, (t) => {
		const { ctx, emit, compactions } = setup(t);
		emit("session_start");
		if (state === "busy") ctx.idle = false;
		else ctx.pending = true;
		t.mock.timers.tick(HOUR);
		assert.equal(compactions.length, 0);
	});
}

test("does not overlap an existing compaction", (t) => {
	const { emit, type, compactions } = setup(t);
	emit("session_start");
	emit("session_before_compact");
	type();
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 0);
	emit("session_compact");
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 1);
});

test("does not repeatedly compact or retry failures without activity", (t) => {
	const { emit, compactions, notifications } = setup(t);
	emit("session_start");
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 1);
	compactions[0].onError(new Error("provider unavailable"));
	assert.deepEqual(notifications.at(-1), {
		message: "Idle compaction failed: provider unavailable", level: "error",
	});
	t.mock.timers.tick(HOUR * 3);
	assert.equal(compactions.length, 1);
	emit("input");
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 2);
});

test("shutdown clears the timer and terminal listener", (t) => {
	const { emit, type, compactions, unsubscribed } = setup(t);
	emit("session_start");
	emit("session_shutdown");
	assert.equal(unsubscribed(), true);
	type();
	t.mock.timers.tick(HOUR);
	assert.equal(compactions.length, 0);
});

for (const mode of ["print", "json", "rpc"]) {
	test(`handles ${mode} mode without terminal hooks`, (t) => {
		const { ctx, emit, compactions } = setup(t);
		ctx.mode = mode;
		ctx.hasUI = mode === "rpc";
		ctx.ui.onTerminalInput = () => assert.fail("terminal hook outside TUI");
		emit("session_start");
		t.mock.timers.tick(HOUR);
		assert.equal(compactions.length, mode === "rpc" ? 1 : 0);
	});
}
