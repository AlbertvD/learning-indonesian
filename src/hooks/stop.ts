/**
 * Stop Hook - Enforces compose validation before session end
 *
 * Blocks the session from closing if:
 * - A compose file was modified during the session
 * - make check-compose was not run after the modification
 */

import { appendLog, clearSessionState, readSessionState, readStdinJson } from "../lib/hook-utils";

const LOG_FILE = `${process.cwd()}/.claude/logs/stop.jsonl`;
const STATE_FILE = `${process.cwd()}/.claude/data/session_state.json`;
const MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;

async function getState(): Promise<Record<string, unknown>> {
	const state = await readSessionState(STATE_FILE);
	const lastUpdated = state.last_updated;
	if (typeof lastUpdated === "string") {
		const stateTime = new Date(lastUpdated).getTime();
		if (Number.isNaN(stateTime) || Date.now() - stateTime > MAX_STATE_AGE_MS) return {};
	}
	return state;
}

async function main(): Promise<void> {
	const inputData = await readStdinJson();
	const sessionId = typeof inputData.session_id === "string" ? inputData.session_id : "unknown";

	const state = await getState();
	const composeModified = state.compose_modified === true;
	const checkComposeRan = state.check_compose_ran === true;
	const modifiedFile = typeof state.compose_modified_file === "string" ? state.compose_modified_file : "a compose file";

	if (composeModified && !checkComposeRan) {
		await appendLog(LOG_FILE, {
			session_id: sessionId,
			blocked: true,
			reason: "compose modified without running check-compose",
			modified_file: modifiedFile,
		});

		process.stderr.write(
			`You modified ${modifiedFile} but did not run 'make check-compose'.\n` +
			`Validate before pushing — a broken compose file auto-deploys to production via Portainer.\n` +
			`Run: make check-compose\n`,
		);
		process.exit(2);
	}

	await clearSessionState(STATE_FILE);
	await appendLog(LOG_FILE, {
		session_id: sessionId,
		blocked: false,
		compose_modified: composeModified,
		check_compose_ran: checkComposeRan,
	});

	process.exit(0);
}

main();
