import { describe, expect, it } from "vitest";
import type { StatusResult } from "simple-git";
import { parseStatus } from "./statusParser";

function makeStatus(
	files: Array<{ path: string; index: string; working_dir: string; from?: string }>,
	conflicted: string[] = []
): StatusResult {
	return {
		not_added: [],
		conflicted,
		created: [],
		deleted: [],
		modified: [],
		renamed: [],
		staged: [],
		files,
		ahead: 0,
		behind: 0,
		current: "main",
		tracking: null,
		detached: false,
		isClean: () => files.length === 0,
	} as unknown as StatusResult;
}

describe("parseStatus", () => {
	it("puts a staged-only modification (index M, working clean) in staged only", () => {
		const result = parseStatus(makeStatus([{ path: "a.md", index: "M", working_dir: " " }]));
		expect(result.staged).toEqual([{ path: "a.md", from: undefined, staged: true, status: "M" }]);
		expect(result.unstaged).toEqual([]);
	});

	it("puts a working-tree-only modification (index clean, working M) in unstaged only", () => {
		const result = parseStatus(makeStatus([{ path: "a.md", index: " ", working_dir: "M" }]));
		expect(result.staged).toEqual([]);
		expect(result.unstaged).toEqual([{ path: "a.md", from: undefined, staged: false, status: "M" }]);
	});

	it("splits a file modified in both index and working dir into both lists", () => {
		const result = parseStatus(makeStatus([{ path: "a.md", index: "M", working_dir: "M" }]));
		expect(result.staged).toEqual([{ path: "a.md", from: undefined, staged: true, status: "M" }]);
		expect(result.unstaged).toEqual([{ path: "a.md", from: undefined, staged: false, status: "M" }]);
	});

	it("treats index '?' + working_dir '?' as a single untracked unstaged entry", () => {
		const result = parseStatus(makeStatus([{ path: "new.md", index: "?", working_dir: "?" }]));
		expect(result.staged).toEqual([]);
		expect(result.unstaged).toEqual([{ path: "new.md", staged: false, status: "?" }]);
	});

	it("carries the rename source through for a staged rename", () => {
		const result = parseStatus(
			makeStatus([{ path: "new.md", index: "R", working_dir: " ", from: "old.md" }])
		);
		expect(result.staged).toEqual([{ path: "new.md", from: "old.md", staged: true, status: "R" }]);
	});

	it("excludes conflicted files from both staged and unstaged lists", () => {
		const result = parseStatus(
			makeStatus([{ path: "conflict.md", index: "U", working_dir: "U" }], ["conflict.md"])
		);
		expect(result.staged).toEqual([]);
		expect(result.unstaged).toEqual([]);
		expect(result.conflicted).toEqual(["conflict.md"]);
	});

	it("carries branch/ahead/behind through", () => {
		const result = parseStatus(makeStatus([]));
		expect(result.branch).toBe("main");
		expect(result.ahead).toBe(0);
		expect(result.behind).toBe(0);
	});
});
