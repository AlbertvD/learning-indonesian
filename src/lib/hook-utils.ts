import { appendFile, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export async function readStdinJson(): Promise<Record<string, unknown>> {
	try {
		const text = await Bun.stdin.text();
		if (!text.trim()) return {};
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export function blockWithError(message: string): never {
	process.stderr.write(`${message}\n`);
	process.exit(2);
}

export async function ensureDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

export async function appendLog(path: string, entry: Record<string, unknown>): Promise<void> {
	await ensureDir(dirname(path));
	const line = `${JSON.stringify({ ...entry, timestamp: new Date().toISOString() })}\n`;
	await appendFile(path, line);
}

export async function rotateIfNeeded(
	path: string,
	maxBytes: number = 512 * 1024,
	keepLines: number = 500,
): Promise<void> {
	const file = Bun.file(path);
	if (!(await file.exists())) return;
	const content = await file.text();
	if (Buffer.byteLength(content) <= maxBytes) return;
	const lines = content.trimEnd().split("\n");
	const kept = lines.slice(-keepLines);
	await Bun.write(path, `${kept.join("\n")}\n`);
}

export async function readSessionState(path: string): Promise<Record<string, unknown>> {
	try {
		const file = Bun.file(path);
		if (!(await file.exists())) return {};
		const text = await file.text();
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return {};
	}
}

export async function writeSessionState(path: string, state: Record<string, unknown>): Promise<void> {
	await ensureDir(dirname(path));
	await Bun.write(path, `${JSON.stringify(state, null, 2)}\n`);
}

export async function clearSessionState(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch {
		// File doesn't exist — that's fine
	}
}
