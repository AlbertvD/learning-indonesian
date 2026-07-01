/**
 * PreToolUse Hook - Enforces homelab-configs rules
 *
 * Blocks:
 * 1. Hardcoded IPs in compose files (use DNS names instead)
 * 2. Dangerous system commands
 * 3. Destructive git operations
 * 4. Portainer API redeployments (wipes UI-managed env vars)
 * 5. Edit/Write/MultiEdit without a prior Read of the same file
 */

import { readFile, realpath, stat } from "node:fs/promises";
import { appendLog, blockWithError, readStdinJson, rotateIfNeeded } from "./hook-utils";

export interface CheckResult {
	blocked: boolean;
	message: string;
}

const ALLOWED: CheckResult = { blocked: false, message: "" };

/** IPs that should be referenced via DNS names in compose files. */
export const HOMELAB_IPS: readonly string[] = [
	String.raw`192\.168\.2\.18`,  // Proxmox host (pve)
	String.raw`192\.168\.2\.51`,  // master-docker (VM 201)
	String.raw`192\.168\.2\.15`,  // Home Assistant (VM 106)
	String.raw`192\.168\.2\.16`,  // Proxmox backup server
	String.raw`192\.168\.2\.105`, // PBS backup server
];

/** Dangerous command patterns. */
const DANGEROUS_PATTERNS: readonly string[] = [
	String.raw`rm\s+(-[rf]+\s+)*(/\*?(\s|$)|~(\s|$)|\$HOME(\s|$))`,
	String.raw`>\s*/dev/sd[a-z]`,
	String.raw`mkfs\.`,
	String.raw`dd\s+if=.*of=/dev`,
	String.raw`chmod\s+777\s+/`,
	String.raw`:\(\)\{.*\}`,
	String.raw`find\s+/\s+.*-delete`,
	String.raw`python[23]?\s+-c\s+.*rmtree`,
	String.raw`cat\s+/dev/\w+\s*>\s*/dev/sd`,
];

/** Files where hardcoded IPs are legitimate. */
const IP_ALLOWED_FILES = [
	"CLAUDE.md",
	"architecture.md",
	"Makefile",
	"pre-tool-use.ts",
	"bind9-duin",
	"NETWORK.md",
];

const LOG_FILE = `${process.cwd()}/.claude/logs/pre_tool_use.jsonl`;

export function checkDangerousGit(command: string): CheckResult {
	// These target the operations that can break GitOps sync with Portainer on
	// main: rewriting pushed history (force push), destroying working-tree/commit
	// state (hard reset, clean -df). LOCAL branch deletion (`git branch -d/-D`) is
	// intentionally NOT blocked — it never touches the remote or main, so it can't
	// affect GitOps; the previous `git branch -D` rule (matched case-insensitively,
	// so it also caught the safe `-d`) blocked routine stale-branch cleanup for no
	// GitOps benefit.
	const patterns = [
		String.raw`git\s+push\s+.*--force`,
		String.raw`git\s+reset\s+--hard`,
		String.raw`git\s+clean\s+-[df]`,
	];
	for (const pattern of patterns) {
		if (new RegExp(pattern, "i").test(command)) {
			return {
				blocked: true,
				message:
					"Destructive git operation blocked. Force pushes and hard resets " +
					"can break GitOps sync with Portainer on the main branch.",
			};
		}
	}
	return ALLOWED;
}

export function checkHardcodedIp(toolInputStr: string, toolInput: Record<string, unknown>): CheckResult {
	const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : "";

	// Allow IPs in documentation and config files
	if (filePath && IP_ALLOWED_FILES.some((f) => filePath.includes(f))) {
		return ALLOWED;
	}

	// Allow DNS config in bind9 zone files
	if (filePath && filePath.includes("bind9")) {
		return ALLOWED;
	}

	// Allow read-only DNS queries
	const command = typeof toolInput.command === "string" ? toolInput.command : "";
	if (command && /dig\s+[^\s]+\s+@|nslookup\s+[^\s]+\s+|host\s+[^\s]+\s+/.test(command)) {
		return ALLOWED;
	}

	for (const ipPattern of HOMELAB_IPS) {
		if (new RegExp(ipPattern).test(toolInputStr)) {
			return {
				blocked: true,
				message:
					"Hardcoded IP blocked. Use DNS names (*.duin.home) in compose files " +
					"instead of IPs — hardcoded IPs break when hosts are reassigned.",
			};
		}
	}
	return ALLOWED;
}

export function checkDangerousCommand(command: string): CheckResult {
	for (const pattern of DANGEROUS_PATTERNS) {
		if (new RegExp(pattern, "i").test(command)) {
			return {
				blocked: true,
				message:
					`Destructive system command blocked. ` +
					"These operations are irreversible on production infrastructure.",
			};
		}
	}
	return ALLOWED;
}

async function resolveTargetPath(filePath: string): Promise<string> {
	try {
		return await realpath(filePath);
	} catch {
		return filePath;
	}
}

/**
 * Blocks Edit / MultiEdit / Write when the target file was not Read or Written earlier
 * in this session's transcript. Mirrors and reinforces the native Edit/Write Read-first
 * check — useful when the native enforcement is bypassed by tool-input rewriting or
 * when defending against a foggy memory of "yes, I read this."
 *
 * Fail-open semantics: if the transcript can't be parsed, allow the operation.
 */
export async function checkReadBeforeEdit(
	toolName: string,
	toolInput: Record<string, unknown>,
	transcriptPath: string,
): Promise<CheckResult> {
	if (toolName !== "Edit" && toolName !== "MultiEdit" && toolName !== "Write") {
		return ALLOWED;
	}

	const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : "";
	if (!filePath || !transcriptPath) return ALLOWED;

	// Write to a brand-new (non-existent) path: nothing to have read.
	if (toolName === "Write") {
		try {
			await stat(filePath);
		} catch {
			return ALLOWED;
		}
	}

	const target = await resolveTargetPath(filePath);

	let transcript: string;
	try {
		transcript = await readFile(transcriptPath, "utf8");
	} catch {
		return ALLOWED;
	}

	for (const line of transcript.split("\n")) {
		if (!line.trim()) continue;
		let entry: { message?: { role?: string; content?: unknown } };
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		const message = entry?.message;
		if (!message || message.role !== "assistant") continue;
		const blocks = message.content;
		if (!Array.isArray(blocks)) continue;
		for (const block of blocks) {
			if (!block || typeof block !== "object") continue;
			const b = block as { type?: string; name?: string; input?: { file_path?: unknown } };
			if (b.type !== "tool_use") continue;
			if (b.name !== "Read" && b.name !== "Write") continue;
			const candidate = b.input?.file_path;
			if (typeof candidate !== "string") continue;
			const resolved = await resolveTargetPath(candidate);
			if (resolved === target) return ALLOWED;
		}
	}

	return {
		blocked: true,
		message:
			`${toolName} of ${filePath} blocked — no prior Read of this file in the session transcript. ` +
			"Use the Read tool first to inspect the current contents before modifying. " +
			"This guard reinforces the native Edit/Write read-first check.",
	};
}

export function checkInfraRedeploy(command: string): CheckResult {
	if (command.includes("api/stacks") && command.includes("redeploy")) {
		return {
			blocked: true,
			message:
				"Redeploying stacks via Portainer API is blocked. " +
				"API redeployments wipe UI-managed environment variables, causing outages. " +
				"Push to main and let Portainer GitOps auto-sync instead.",
		};
	}
	return ALLOWED;
}

async function main(): Promise<void> {
	const inputData = await readStdinJson();

	const toolName = typeof inputData.tool_name === "string" ? inputData.tool_name : "";
	const toolInput =
		typeof inputData.tool_input === "object" && inputData.tool_input !== null
			? (inputData.tool_input as Record<string, unknown>)
			: {};
	const sessionId = typeof inputData.session_id === "string" ? inputData.session_id : "unknown";
	const transcriptPath = typeof inputData.transcript_path === "string" ? inputData.transcript_path : "";
	const toolInputStr = JSON.stringify(toolInput);

	const event: Record<string, unknown> = {
		session_id: sessionId,
		tool_name: toolName,
		blocked: false,
		reason: null,
	};

	function block(message: string): never {
		event.blocked = true;
		event.reason = message;
		appendLog(LOG_FILE, event);
		blockWithError(`BLOCKED: ${message}`);
	}

	if (toolName === "Bash") {
		const command = typeof toolInput.command === "string" ? toolInput.command : "";

		const infraResult = checkInfraRedeploy(command);
		if (infraResult.blocked) block(infraResult.message);

		const gitResult = checkDangerousGit(command);
		if (gitResult.blocked) block(gitResult.message);

		const dangerResult = checkDangerousCommand(command);
		if (dangerResult.blocked) block(dangerResult.message);
	}

	// IP check applies to all tools (Edit, Write, Bash)
	const ipResult = checkHardcodedIp(toolInputStr, toolInput);
	if (ipResult.blocked) block(ipResult.message);

	const readBeforeEditResult = await checkReadBeforeEdit(toolName, toolInput, transcriptPath);
	if (readBeforeEditResult.blocked) block(readBeforeEditResult.message);

	await appendLog(LOG_FILE, event);
	await rotateIfNeeded(LOG_FILE);

	process.exit(0);
}

main();
