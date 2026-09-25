import type { FileStatusResult, StatusResult } from "simple-git";
import type { ChangeEntry, ChangeStatus, RepoStatus } from "./types";

/**
 * Maps a single git porcelain status-code character to our simplified status.
 * Unrecognized non-space codes fall back to "M" so a file is never silently
 * dropped from the list because of an unfamiliar code.
 */
function mapCode(code: string): ChangeStatus | null {
	switch (code) {
		case " ":
			return null;
		case "A":
			return "A";
		case "D":
			return "D";
		case "R":
		case "C":
			return "R";
		case "U":
			return "U";
		case "?":
			return "?";
		case "M":
		default:
			return "M";
	}
}

/**
 * Converts simple-git's StatusResult (mirrors `git status --porcelain=v1`) into
 * separate staged/unstaged ChangeEntry lists. Conflicted paths (e.g. "UU") are
 * excluded from both lists and reported separately, since staging/unstaging a
 * conflicted file has no useful meaning until the conflict is resolved.
 */
export function parseStatus(result: StatusResult): RepoStatus {
	const staged: ChangeEntry[] = [];
	const unstaged: ChangeEntry[] = [];
	const conflicted = new Set(result.conflicted);

	for (const file of result.files as FileStatusResult[]) {
		if (conflicted.has(file.path)) {
			continue;
		}

		const isUntracked = file.index === "?" && file.working_dir === "?";
		if (isUntracked) {
			unstaged.push({ path: file.path, staged: false, status: "?" });
			continue;
		}

		const indexStatus = mapCode(file.index);
		if (indexStatus) {
			staged.push({ path: file.path, from: file.from, staged: true, status: indexStatus });
		}

		const workingStatus = mapCode(file.working_dir);
		if (workingStatus) {
			unstaged.push({ path: file.path, from: file.from, staged: false, status: workingStatus });
		}
	}

	return {
		branch: result.current,
		ahead: result.ahead,
		behind: result.behind,
		staged,
		unstaged,
		conflicted: Array.from(conflicted),
	};
}
