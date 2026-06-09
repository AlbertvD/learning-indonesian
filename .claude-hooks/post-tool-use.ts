/**
 * PostToolUse Hook - Tracks compose file modifications and validation runs
 *
 * Monitors:
 * 1. Compose file modifications via Write/Edit tools
 * 2. make check-compose runs via Bash
 *
 * Updates session state so the stop hook can enforce validation.
 */

import { appendLog, readSessionState, readStdinJson, rotateIfNeeded, writeSessionState } from "./hook-utils";

const LOG_FILE = `${process.cwd()}/.claude/logs/post_tool_use.jsonl`;
const STATE_FILE = `${process.cwd()}/.claude/data/session_state.json`;

export function detectComposeModification(toolName: string, toolInput: Record<string, unknown>): string | null {
	if (toolName !== "Write" && toolName !== "Edit") return null;
	const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : "";
	if (filePath.includes("compose.yml") || filePath.includes("compose.yaml")) {
		return filePath;
	}
	return null;
}

export function detectCheckComposeRun(toolName: string, toolInput: Record<string, unknown>): boolean {
	if (toolName !== "Bash") return false;
	const command = typeof toolInput.command === "string" ? toolInput.command : "";
	return command.includes("check-compose") || command.includes("make check-compose");
}

/**
 * Detects a LIVE Stage-A publish (the lesson-stage skill orchestrator, or the
 * bare canonical entry point used to bypass it). Returns the lesson number so
 * the stop hook can enforce that a complete Stage-A capture exists for it.
 *
 * Matches ONLY a genuine invocation: a `;`/`&&`/`|`-separated segment that
 * STARTS with (optional env-var assignments +) `bun [run] <…>/<script>.ts <N>`,
 * where `<N>` is a standalone lesson number. This deliberately rejects mere
 * MENTIONS of the script — a typecheck (`tsc … run-stage-a.ts 2>&1`), grep, cat,
 * echo, or `bun -e '…run-stage-a.ts…'` — and rejects a stderr-redirect `2>&1`
 * being misread as lesson 2 (the false positive this guards against).
 * A `--dry-run` writes nothing → no capture is required → not detected.
 */
export function detectStageARun(toolName: string, toolInput: Record<string, unknown>): number | null {
	if (toolName !== "Bash") return null;
	const command = typeof toolInput.command === "string" ? toolInput.command : "";
	if (command.includes("--dry-run")) return null;
	const INVOCATION = /^(?:\w+=\S+\s+)*bun(?:\s+run)?\s+\S*(?:run-stage-a|publish-lesson-content)\.ts\s+(\d+)(?=\s|$)/;
	for (const segment of command.split(/&&|\|\||[;|\n]/)) {
		const m = segment.trim().match(INVOCATION);
		if (m) return parseInt(m[1], 10);
	}
	return null;
}

/**
 * Detects a LIVE capability publish (Stage B + Stage Vocabulary), which seeds
 * the schedulable capability surface. Returns the lesson number so the stop hook
 * can enforce a passing capability gate (no stuck-draft caps) for it.
 *
 * Two real invocation forms, each anchored per-segment to reject mere mentions
 * (see detectStageARun's rationale — same `2>&1`/grep/echo guards):
 *   - `bun [run] <…>/publish-approved-content.ts <N>`   (the CLI; Stage A+B+Vocab)
 *   - `make publish-content LESSON=<N>`                  (the Makefile wrapper)
 * A `--dry-run` writes no capability rows → no gate required → not detected.
 */
export function detectCapabilityRun(toolName: string, toolInput: Record<string, unknown>): number | null {
	if (toolName !== "Bash") return null;
	const command = typeof toolInput.command === "string" ? toolInput.command : "";
	if (command.includes("--dry-run")) return null;
	const BUN_FORM = /^(?:\w+=\S+\s+)*bun(?:\s+run)?\s+\S*publish-approved-content\.ts\s+(\d+)(?=\s|$)/;
	const MAKE_FORM = /^(?:\w+=\S+\s+)*make\s+publish-content\b/;
	for (const segment of command.split(/&&|\|\||[;|\n]/)) {
		const seg = segment.trim();
		const bun = seg.match(BUN_FORM);
		if (bun) return parseInt(bun[1], 10);
		if (MAKE_FORM.test(seg)) {
			const lesson = seg.match(/\bLESSON=(\d+)\b/);
			if (lesson) return parseInt(lesson[1], 10);
		}
	}
	return null;
}

async function updateState(key: string, value: string | boolean): Promise<void> {
	const state = await readSessionState(STATE_FILE);
	state[key] = value;
	state.last_updated = new Date().toISOString();
	await writeSessionState(STATE_FILE, state);
}

async function main(): Promise<void> {
	const inputData = await readStdinJson();

	const toolName = typeof inputData.tool_name === "string" ? inputData.tool_name : "";
	const toolInput =
		typeof inputData.tool_input === "object" && inputData.tool_input !== null
			? (inputData.tool_input as Record<string, unknown>)
			: {};
	const sessionId = typeof inputData.session_id === "string" ? inputData.session_id : "unknown";

	const composeFile = detectComposeModification(toolName, toolInput);
	const checkComposeRan = detectCheckComposeRun(toolName, toolInput);
	const stageALesson = detectStageARun(toolName, toolInput);
	const capabilityLesson = detectCapabilityRun(toolName, toolInput);

	if (composeFile) {
		await updateState("compose_modified", true);
		await updateState("compose_modified_file", composeFile);
		await updateState("check_compose_ran", false); // must re-validate after edit
	}

	if (checkComposeRan) {
		await updateState("check_compose_ran", true);
		await updateState("compose_modified", false); // validated — no longer dirty
	}

	if (stageALesson !== null) {
		// A live Stage-A publish ran — the stop hook will require a complete,
		// passing capture (audio-scripts/SD L<N>.report.json) for this lesson.
		await updateState("stage_a_ran", true);
		await updateState("stage_a_lesson", String(stageALesson));
	}

	if (capabilityLesson !== null) {
		// A live capability publish ran — the stop hook will require a passing
		// capability gate (.claude/data/capability-report-<N>.json) for this lesson.
		await updateState("capability_ran", true);
		await updateState("capability_lesson", String(capabilityLesson));
	}

	await appendLog(LOG_FILE, {
		session_id: sessionId,
		tool_name: toolName,
		compose_modified: !!composeFile,
		check_compose_ran: checkComposeRan,
		stage_a_lesson: stageALesson,
		capability_lesson: capabilityLesson,
	});

	await rotateIfNeeded(LOG_FILE);
	process.exit(0);
}

main();
