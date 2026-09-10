import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ReadProcessFile = (path: string) => string | undefined;
type SpawnProcess = (
	command: string,
	args: string[],
	options: { detached: boolean; stdio: "ignore" },
) => { unref(): unknown };

export function alertTerminal(
	write: (value: string) => unknown = (value) => process.stdout.write(value),
): void {
	write("\x07");
}

export function findFootPid(
	pid = process.ppid,
	readProcessFile: ReadProcessFile = (path) => readFileSync(path, "utf8"),
): number | undefined {
	while (pid > 1) {
		const command = readProcessFile(`/proc/${pid}/comm`)?.trim();
		if (command === "foot" || command === "footclient") return pid;

		const status = readProcessFile(`/proc/${pid}/status`);
		const parent = status?.match(/^PPid:\s+(\d+)$/m);
		pid = parent ? Number(parent[1]) : 0;
	}
}

export function markFootUrgent(
	pid: number,
	spawnProcess: SpawnProcess = spawn,
): void {
	spawnProcess("swaymsg", [`[pid=${pid}]`, "urgent", "enable"], {
		detached: true,
		stdio: "ignore",
	}).unref();
}

export default function (pi: ExtensionAPI): void {
	const footPid = findFootPid();

	pi.on("agent_settled", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.isIdle()) return;
		alertTerminal();
		if (footPid) markFootUrgent(footPid);
	});
}
