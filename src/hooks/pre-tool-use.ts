/**
 * PreToolUse Hook - Enforces homelab-configs rules
 *
 * Blocks:
 * 1. Hardcoded IPs in compose files (use DNS names instead)
 * 2. Dangerous system commands
 * 3. Destructive git operations
 * 4. Portainer API redeployments (wipes UI-managed env vars)
 */

import { appendLog, blockWithError, readStdinJson, rotateIfNeeded } from "../lib/hook-utils";

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
	const patterns = [
		String.raw`git\s+push\s+.*--force`,
		String.raw`git\s+reset\s+--hard`,
		String.raw`git\s+clean\s+-[df]`,
		String.raw`git\s+branch\s+-D`,
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

	await appendLog(LOG_FILE, event);
	await rotateIfNeeded(LOG_FILE);

	process.exit(0);
}

main();
