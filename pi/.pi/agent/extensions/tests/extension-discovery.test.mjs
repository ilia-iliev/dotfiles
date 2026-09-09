import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const extensionDirectory = new URL("../", import.meta.url);

test("every top-level TypeScript file exports an extension factory", async () => {
	const extensionFiles = (await readdir(extensionDirectory)).filter((name) => name.endsWith(".ts"));

	for (const extensionFile of extensionFiles) {
		const source = await readFile(new URL(extensionFile, extensionDirectory), "utf8");
		assert.match(source, /export default (?:async )?function/, extensionFile);
	}
});
