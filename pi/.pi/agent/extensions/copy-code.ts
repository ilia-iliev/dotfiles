import { copyToClipboard, type ExtensionAPI, type SessionEntry } from "@earendil-works/pi-coding-agent";

const PREVIEW_LENGTH = 56;

type CodeBlock = {
	content: string;
	language: string;
};

function assistantText(entry: SessionEntry): string | undefined {
	if (entry.type !== "message" || entry.message.role !== "assistant") return undefined;
	return entry.message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}

export function extractCodeBlocks(markdown: string): CodeBlock[] {
	const lines = markdown.replaceAll("\r\n", "\n").split("\n");
	const blocks: CodeBlock[] = [];

	for (let index = 0; index < lines.length; index++) {
		const opening = lines[index]?.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
		if (!opening) continue;

		const [, indent = "", fence = "", rawInfo = ""] = opening;
		if (fence.startsWith("`") && rawInfo.includes("`")) continue;

		const contentLines: string[] = [];
		let closingIndex = index + 1;
		for (; closingIndex < lines.length; closingIndex++) {
			const line = lines[closingIndex] ?? "";
			const closing = line.match(/^( {0,3})(`+|~+)[ \t]*$/);
			if (
				closing &&
				closing[2]?.startsWith(fence[0] ?? "") &&
				closing[2].length >= fence.length
			) {
				break;
			}

			const removableIndent = Math.min(indent.length, line.match(/^ */)?.[0].length ?? 0);
			contentLines.push(line.slice(removableIndent));
		}

		if (closingIndex === lines.length) continue;

		const language = rawInfo.trim().split(/\s+/, 1)[0] || "text";
		blocks.push({ content: contentLines.join("\n"), language });
		index = closingIndex;
	}

	return blocks;
}

function lineCount(content: string): number {
	return content.length === 0 ? 0 : content.split("\n").length;
}

function preview(content: string): string {
	const firstLine = content.split("\n").find((line) => line.trim())?.trim() || "(empty)";
	if (firstLine.length <= PREVIEW_LENGTH) return firstLine;
	return `${firstLine.slice(0, PREVIEW_LENGTH - 3)}...`;
}

function optionLabel(block: CodeBlock, index: number): string {
	return `${index + 1}. ${preview(block.content)} (${block.language}, ${lineCount(block.content)} line(s))`;
}

function latestAssistantBlocks(entries: SessionEntry[]): CodeBlock[] {
	for (let index = entries.length - 1; index >= 0; index--) {
		const text = assistantText(entries[index]);
		if (text !== undefined) return extractCodeBlocks(text);
	}
	return [];
}

async function copy(block: CodeBlock): Promise<void> {
	await copyToClipboard(block.content);
}

export default function copyCodeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("copyc", {
		description: "Copy a code block from the latest assistant response",
		handler: async (_args, ctx) => {
			const blocks = latestAssistantBlocks(ctx.sessionManager.getBranch());
			if (blocks.length === 0) {
				ctx.ui.notify("The latest assistant response has no code blocks", "warning");
				return;
			}

			let selected = blocks[0];
			if (blocks.length > 1) {
				const labels = blocks.map(optionLabel);
				const answer = await ctx.ui.input(`Select option:\n${labels.join("\n")}`, "Number");
				if (answer === undefined) return;

				const option = Number(answer.trim());
				if (!Number.isInteger(option) || option < 1 || option > blocks.length) {
					ctx.ui.notify(`Enter a number from 1 to ${blocks.length}`, "warning");
					return;
				}
				selected = blocks[option - 1];
			}

			await copy(selected);
			ctx.ui.notify("Copied code block", "info");
		},
	});
}
