import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitService } from "./GitService";

const execFileAsync = promisify(execFile);

/**
 * Runs against a real temp git repo rather than mocking simple-git, since a
 * real `git` binary is guaranteed present in the dev environment and this
 * gives far higher confidence than mocking simple-git's API surface.
 */
describe("GitService (integration, real git CLI)", () => {
	let dir: string;
	let git: GitService;

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), "bigit-test-"));
		await execFileAsync("git", ["init", "-q", "-b", "main", dir]);
		await execFileAsync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
		await execFileAsync("git", ["-C", dir, "config", "user.name", "bigit test"]);
		git = new GitService({ baseDir: dir, binaryPath: "git" });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("reports isRepo() true for an initialized repo", async () => {
		expect(await git.isRepo()).toBe(true);
	});

	it("moves a new file from untracked -> staged -> committed", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");

		let status = await git.status();
		expect(status.unstaged).toEqual([{ path: "note.md", staged: false, status: "?" }]);
		expect(status.staged).toEqual([]);

		await git.stage(["note.md"]);
		status = await git.status();
		expect(status.staged).toEqual([{ path: "note.md", from: undefined, staged: true, status: "A" }]);
		expect(status.unstaged).toEqual([]);

		await git.commit("Add note");
		status = await git.status();
		expect(status.staged).toEqual([]);
		expect(status.unstaged).toEqual([]);

		const log = await git.log();
		expect(log).toHaveLength(1);
		expect(log[0].message).toBe("Add note");
	});

	it("unstages a staged file back to untracked", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");
		await git.stage(["note.md"]);

		await git.unstage(["note.md"]);

		const status = await git.status();
		expect(status.staged).toEqual([]);
		expect(status.unstaged).toEqual([{ path: "note.md", staged: false, status: "?" }]);
	});

	it("discards a tracked file's working-tree modification", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");
		await git.stage(["note.md"]);
		await git.commit("Add note");

		writeFileSync(join(dir, "note.md"), "changed\n");
		let status = await git.status();
		expect(status.unstaged).toEqual([{ path: "note.md", staged: false, status: "M" }]);

		await git.discardTracked(["note.md"]);
		status = await git.status();
		expect(status.unstaged).toEqual([]);
	});

	it("reads file content at a ref via getFileAtRef, null when absent there", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");
		await git.stage(["note.md"]);
		await git.commit("Add note");

		expect(await git.getFileAtRef("HEAD", "note.md")).toBe("hello\n");
		expect(await git.getFileAtRef("HEAD", "missing.md")).toBeNull();
	});

	it("returns null for HEAD reads on a repo with no commits yet (unborn branch)", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");
		// No commit made - `git show HEAD:note.md` fails with "invalid object name
		// 'HEAD'" here, which should be treated the same as "file absent at ref".
		expect(await git.getFileAtRef("HEAD", "note.md")).toBeNull();
	});

	it("lists local branches and switches between them", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");
		await git.stage(["note.md"]);
		await git.commit("Add note");

		await git.createBranch("feature");
		let branches = await git.branchLocal();
		expect(branches.find((b) => b.name === "feature")?.current).toBe(true);
		expect(branches.find((b) => b.name === "main")?.current).toBe(false);

		await git.checkoutBranch("main");
		branches = await git.branchLocal();
		expect(branches.find((b) => b.name === "main")?.current).toBe(true);
	});

	it("reports the files changed by a commit", async () => {
		writeFileSync(join(dir, "note.md"), "hello\n");
		await git.stage(["note.md"]);
		await git.commit("Add note");

		writeFileSync(join(dir, "note.md"), "hello\nworld\n");
		await git.stage(["note.md"]);
		await git.commit("Update note");

		const log = await git.log();
		const files = await git.changedFilesInCommit(log[0].hash);
		expect(files).toEqual(["note.md"]);
	});
});

describe("GitService push/pull (integration, real git CLI + local bare remote)", () => {
	let bareDir: string;
	let dirs: string[];

	beforeEach(async () => {
		bareDir = mkdtempSync(join(tmpdir(), "bigit-remote-"));
		await execFileAsync("git", ["init", "-q", "--bare", "-b", "main", bareDir]);
		dirs = [];
	});

	afterEach(() => {
		rmSync(bareDir, { recursive: true, force: true });
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});

	async function makeClone(): Promise<GitService> {
		const dir = mkdtempSync(join(tmpdir(), "bigit-clone-"));
		dirs.push(dir);
		await execFileAsync("git", ["init", "-q", "-b", "main", dir]);
		await execFileAsync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
		await execFileAsync("git", ["-C", dir, "config", "user.name", "bigit test"]);
		await execFileAsync("git", ["-C", dir, "remote", "add", "origin", bareDir]);
		return new GitService({ baseDir: dir, binaryPath: "git" });
	}

	it("push() auto-sets upstream on a branch that's never been pushed before", async () => {
		const a = await makeClone();
		const [dirA] = dirs;
		writeFileSync(join(dirA, "note.md"), "hello\n");
		await a.stage(["note.md"]);
		await a.commit("Add note");

		await a.push();

		const { stdout } = await execFileAsync("git", ["--git-dir", bareDir, "log", "--oneline", "-1"]);
		expect(stdout).toContain("Add note");
	});

	it("pull() retrieves commits another clone pushed to the shared remote", async () => {
		const a = await makeClone();
		const [dirA] = dirs;
		writeFileSync(join(dirA, "note.md"), "hello\n");
		await a.stage(["note.md"]);
		await a.commit("Add note");
		await a.push();

		const b = await makeClone();
		await b.pull();
		expect(await b.getFileAtRef("HEAD", "note.md")).toBe("hello\n");

		writeFileSync(join(dirA, "note.md"), "hello\nworld\n");
		await a.stage(["note.md"]);
		await a.commit("Update note");
		await a.push();

		await b.pull();
		expect(await b.getFileAtRef("HEAD", "note.md")).toBe("hello\nworld\n");
	});
});
