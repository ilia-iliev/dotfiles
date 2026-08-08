import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { spawn, spawnSync } from "node:child_process";

const BRANCH_EDITOR_TEXT = "PI_BRANCH_EDITOR_TEXT";

type BranchChoice = {
	entryId: string;
	label: string;
	text: string;
};

function messageText(entry: SessionEntry): string {
	if (entry.type !== "message" || entry.message.role !== "user") return "";
	if (typeof entry.message.content === "string") return entry.message.content;
	return entry.message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function branchChoices(ctx: ExtensionCommandContext): BranchChoice[] {
	return ctx.sessionManager.getEntries().flatMap((entry, index) => {
		const text = messageText(entry);
		if (!text) return [];
		const summary = text.replace(/\s+/g, " ").trim();
		return [{ entryId: entry.id, label: `${index + 1}. ${summary}`, text }];
	});
}

function createBranch(ctx: ExtensionCommandContext, choice: BranchChoice): string {
	const currentFile = ctx.sessionManager.getSessionFile();
	if (!currentFile) {
		throw new Error("This session has not been saved yet. Wait for the first assistant response.");
	}

	const selectedEntry = ctx.sessionManager.getEntry(choice.entryId);
	if (!selectedEntry || selectedEntry.type !== "message" || selectedEntry.message.role !== "user") {
		throw new Error("The selected message is no longer available.");
	}

	if (selectedEntry.parentId === null) {
		const branch = SessionManager.create(ctx.cwd, ctx.sessionManager.getSessionDir(), {
			parentSession: currentFile,
		});
		const sessionFile = branch.getSessionFile();
		if (!sessionFile) throw new Error("Failed to create branched session.");
		return sessionFile;
	}

	const source = SessionManager.open(currentFile, ctx.sessionManager.getSessionDir());
	const sessionFile = source.createBranchedSession(selectedEntry.parentId);
	if (!sessionFile) throw new Error("Failed to create branched session.");
	return sessionFile;
}

function terminalCandidates(): Array<{ command: string; prefix: string[] }> {
	const candidates: Array<{ command: string; prefix: string[] }> = [];
	const configured = process.env.TERMINAL?.trim();
	if (configured) {
		const [command, ...args] = configured.split(/\s+/);
		if (command) candidates.push({ command, prefix: [...args, "-e"] });
	}
	candidates.push(
		{ command: "i3-sensible-terminal", prefix: ["-e"] },
		{ command: "x-terminal-emulator", prefix: ["-e"] },
		{ command: "alacritty", prefix: ["-e"] },
		{ command: "kitty", prefix: ["-e"] },
		{ command: "wezterm", prefix: ["start", "--"] },
		{ command: "foot", prefix: ["-e"] },
		{ command: "gnome-terminal", prefix: ["--"] },
	);
	return candidates;
}

function commandExists(command: string): boolean {
	return spawnSync("sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
		stdio: "ignore",
	}).status === 0;
}

function launchBranch(sessionFile: string, editorText: string): void {
	const configuredPi = process.env.PI_BRANCH_COMMAND?.trim() || "pi";
	const [piCommand, ...piPrefix] = configuredPi.split(/\s+/);
	if (!piCommand) throw new Error("PI_BRANCH_COMMAND is empty.");

	for (const terminal of terminalCandidates()) {
		if (!commandExists(terminal.command)) continue;
		const child = spawn(
			terminal.command,
			[...terminal.prefix, piCommand, ...piPrefix, "--session", sessionFile],
			{
				detached: true,
				stdio: "ignore",
				env: { ...process.env, [BRANCH_EDITOR_TEXT]: editorText },
			},
		);
		child.unref();
		return;
	}
	throw new Error("No terminal emulator found. Set TERMINAL to its executable.");
}

function hideHeader(ctx: ExtensionCommandContext): void {
	if (ctx.mode !== "tui") return;
	ctx.ui.setHeader(() => ({
		render: () => [],
		invalidate() {},
	}));
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		const editorText = process.env[BRANCH_EDITOR_TEXT];
		if (editorText === undefined) return;
		delete process.env[BRANCH_EDITOR_TEXT];
		ctx.ui.setEditorText(editorText);
	});

	pi.registerCommand("clear", {
		description: "Clear the context and terminal transcript",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await ctx.newSession({
				withSession: async (newCtx) => {
					hideHeader(newCtx);
					newCtx.ui.setEditorText("");
				},
			});
		},
	});

	pi.registerCommand("branch", {
		description: "Branch into a new terminal and keep this terminal unchanged",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			const choices = branchChoices(ctx);
			if (choices.length === 0) {
				ctx.ui.notify("No messages to branch from", "warning");
				return;
			}

			const selectedLabel = await ctx.ui.select(
				"Branch from user message",
				choices.map((choice) => choice.label),
			);
			if (!selectedLabel) return;
			const choice = choices.find((candidate) => candidate.label === selectedLabel);
			if (!choice) return;

			const sessionFile = createBranch(ctx, choice);
			launchBranch(sessionFile, choice.text);
			ctx.ui.notify("Branched to new terminal", "info");
		},
	});
}
