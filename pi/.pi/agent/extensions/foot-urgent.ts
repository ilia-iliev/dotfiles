import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function parentPid(pid: number): number {
	const status = readFileSync(`/proc/${pid}/status`, "utf8");
	const match = status.match(/^PPid:\s+(\d+)$/m);
	return match ? Number(match[1]) : 0;
}

function footPid(): number | undefined {
	let pid = process.ppid;
	while (pid > 1) {
		const command = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
		if (command === "foot" || command === "footclient") return pid;
		pid = parentPid(pid);
	}
}

function markFootUrgent(): void {
	const pid = footPid();
	if (!pid) return;
	spawn("swaymsg", [`[pid=${pid}]`, "urgent", "enable"], {
		detached: true,
		stdio: "ignore",
	}).unref();
}

export default function (pi: ExtensionAPI): void {
	pi.on("agent_settled", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.isIdle()) return;
		markFootUrgent();
	});
}
