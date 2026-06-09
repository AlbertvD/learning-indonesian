/**
 * Stop Hook - Enforces compose validation before session end
 *
 * Blocks the session from closing if:
 * - A compose file was modified during the session
 * - make check-compose was not run after the modification
 */

import { existsSync, readFileSync, statSync } from "node:fs";

import { appendLog, clearSessionState, readSessionState, readStdinJson } from "./hook-utils";

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

	// Stage-A capture enforcement (lesson-stage skill): if a LIVE Stage-A publish
	// ran this session, a complete + passing capture must exist for that lesson
	// so no data-quality gap reaches "done". No-op for every other session.
	if (state.stage_a_ran === true && typeof state.stage_a_lesson === "string") {
		const n = state.stage_a_lesson;
		const capturePath = `${process.cwd()}/audio-scripts/SD L${n}.report.json`;
		const grammarPath = `${process.cwd()}/audio-scripts/SD L${n}.txt`;
		let captureOk = false;
		let reason = "no capture report found";
		if (existsSync(capturePath)) {
			try {
				const cap = JSON.parse(readFileSync(capturePath, "utf8")) as Record<string, unknown>;
				if (cap.ok !== true) reason = `capture ok=${String(cap.ok)} (a check failed)`;
				else if (cap.mode !== "live") reason = `capture mode=${String(cap.mode)} (not a live run)`;
				else if (!(existsSync(grammarPath) && statSync(grammarPath).size > 0)) reason = "grammar audio script missing or empty";
				else captureOk = true;
			} catch {
				reason = "capture report is unreadable";
			}
		}

		if (!captureOk) {
			await appendLog(LOG_FILE, {
				session_id: sessionId,
				blocked: true,
				reason: `stage A lesson ${n} ran without a complete capture: ${reason}`,
			});
			process.stderr.write(
				`Stage A for lesson ${n} ran live, but its capture is incomplete (${reason}).\n` +
				`A data-quality gap must not slip through. Run the lesson-stage orchestrator to completion:\n` +
				`  bun .claude/skills/lesson-stage/scripts/run-stage-a.ts ${n}\n` +
				`It asserts every Lesson Gate, reads the DB back for parity, and generates + coverage-checks\n` +
				`the grammar audio script — writing audio-scripts/SD L${n}.report.json with ok=true on success.\n`,
			);
			process.exit(2);
		}
	}

	// Capability gate enforcement (capability-stage skill): if a LIVE capability
	// publish ran this session, a passing capability gate must exist for that
	// lesson — the central DQ risk is status=partial (rows written but caps stuck
	// draft = not schedulable). No-op for every other session.
	if (state.capability_ran === true && typeof state.capability_lesson === "string") {
		const n = state.capability_lesson;
		const capturePath = `${process.cwd()}/.claude/data/capability-report-${n}.json`;
		let captureOk = false;
		let reason = "capability gate not run";
		if (existsSync(capturePath)) {
			try {
				const cap = JSON.parse(readFileSync(capturePath, "utf8")) as Record<string, unknown>;
				if (cap.ok !== true) reason = `capability gate ok=${String(cap.ok)} (a check failed — likely stuck-draft caps)`;
				else captureOk = true;
			} catch {
				reason = "capability gate report is unreadable";
			}
		}

		if (!captureOk) {
			await appendLog(LOG_FILE, {
				session_id: sessionId,
				blocked: true,
				reason: `capability lesson ${n} ran without a passing gate: ${reason}`,
			});
			process.stderr.write(
				`A capability publish for lesson ${n} ran live, but the capability gate has not passed (${reason}).\n` +
				`A data-quality gap must not slip through. Run the capability gate to completion:\n` +
				`  bun .claude/skills/capability-stage/scripts/capability-readback.ts ${n} --gate\n` +
				`It asserts the capability surface is schedulable (caps exist, ZERO stuck-draft caps, read-back complete)\n` +
				`and writes .claude/data/capability-report-${n}.json with ok=true on success.\n` +
				`If caps are stuck draft (status=partial), re-publish to promote them, then re-run the gate.\n`,
			);
			process.exit(2);
		}
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
