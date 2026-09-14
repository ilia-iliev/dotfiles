import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ReadProcessFile = (path: string) => string | undefined;
type SpawnProcess = (
	command: string,
	args: string[],
	options: { detached: boolean; stdio: "ignore" },
) => { unref(): unknown };
type TerminalTarget = { command: string; args: string[] };

function tmuxClientPid(): string {
	return execFileSync("tmux", ["display-message", "-p", "#{client_pid}"], {
		encoding: "utf8",
	});
}

function variable(environment: string, name: string): string | undefined {
	return environment
		.split("\0")
		.find((entry) => entry.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

export function resolveTerminalTarget(
	environment: Record<string, string | undefined> = process.env,
	getTmuxClientPid: () => string | undefined = tmuxClientPid,
	readProcessFile: ReadProcessFile = (path) => readFileSync(path, "utf8"),
): TerminalTarget | undefined {
	let pid = process.ppid;
	let alacrittyWindowId = environment.ALACRITTY_WINDOW_ID;

	if (environment.TMUX) {
		pid = Number(getTmuxClientPid()?.trim());
		if (!Number.isInteger(pid) || pid < 2) return;
		alacrittyWindowId = variable(
			readProcessFile(`/proc/${pid}/environ`) ?? "",
			"ALACRITTY_WINDOW_ID",
		);
	}

	if (alacrittyWindowId && /^\d+$/.test(alacrittyWindowId)) {
		return {
			command: "xdotool",
			args: ["set_window", "--urgency", "1", alacrittyWindowId],
		};
	}

	while (pid > 1) {
		const command = readProcessFile(`/proc/${pid}/comm`)?.trim();
		if (command === "foot" || command === "footclient") {
			return {
				command: "swaymsg",
				args: [`[pid=${pid}]`, "urgent", "enable"],
			};
		}
		const parent = readProcessFile(`/proc/${pid}/status`)?.match(/^PPid:\s+(\d+)$/m);
		pid = parent ? Number(parent[1]) : 0;
	}
}

export function sendNotification(
	target: TerminalTarget | undefined,
	spawnProcess: SpawnProcess = spawn,
): void {
	if (!target) return;
	spawnProcess(target.command, target.args, {
		detached: true,
		stdio: "ignore",
	}).unref();
}

export default function (pi: ExtensionAPI): void {
	const target = resolveTerminalTarget();
	pi.on("agent_settled", (_event, ctx) => {
		if (ctx.mode === "tui" && ctx.isIdle()) sendNotification(target);
	});
}
