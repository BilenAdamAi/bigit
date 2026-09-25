import { execFile } from "child_process";
import simpleGit, { type SimpleGit } from "simple-git";
import type { BranchInfo, CommitEntry, RepoStatus } from "./types";
import { parseStatus } from "./statusParser";

export class GitBackendError extends Error {}

export interface GitServiceOptions {
	baseDir: string;
	binaryPath: string;
}

/**
 * Thin, typed wrapper around simple-git. Every method normalizes failures into
 * a GitBackendError with a message safe to show directly in a Notice, so
 * callers never need to inspect raw git/simple-git errors.
 */
export class GitService {
	private git: SimpleGit;

	constructor(private options: GitServiceOptions) {
		this.git = simpleGit({
			baseDir: options.baseDir,
			binary: options.binaryPath,
			maxConcurrentProcesses: 1,
			trimmed: true,
		});
	}

	get baseDir(): string {
		return this.options.baseDir;
	}

	/** Runs `<binary> --version` directly, without a repo context, to validate the binary exists and is executable. */
	static async validateBinary(binaryPath: string): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(binaryPath, ["--version"], (error, stdout) => {
				if (error) {
					reject(new GitBackendError(`git binary "${binaryPath}" could not be run: ${error.message}`));
					return;
				}
				resolve(stdout.trim());
			});
		});
	}

	async isRepo(): Promise<boolean> {
		try {
			return await this.git.checkIsRepo();
		} catch {
			return false;
		}
	}

	async status(): Promise<RepoStatus> {
		return this.run(async () => parseStatus(await this.git.status()));
	}

	async stage(paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		await this.run(() => this.git.add(paths));
	}

	async unstage(paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		await this.run(async () => {
			try {
				await this.git.raw(["restore", "--staged", "--", ...paths]);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				if (!/could not resolve HEAD/i.test(msg)) throw error;
				// No commits yet (unborn branch) - "restore --staged" needs a HEAD to
				// restore from; git itself recommends `rm --cached` in this case.
				await this.git.raw(["rm", "--cached", "-q", "--", ...paths]);
			}
		});
	}

	/** Reverts a tracked file to its checked-out (HEAD/index) content. Not valid for untracked files. */
	async discardTracked(paths: string[]): Promise<void> {
		if (paths.length === 0) return;
		await this.run(() => this.git.checkout(["--", ...paths]));
	}

	async commit(message: string): Promise<void> {
		const trimmed = message.trim();
		if (!trimmed) {
			throw new GitBackendError("Commit message cannot be empty.");
		}
		await this.run(() => this.git.commit(trimmed));
	}

	/** Returns file contents at a given ref (e.g. "HEAD"), or null if the file doesn't exist at that ref. */
	async getFileAtRef(ref: string, path: string): Promise<string | null> {
		try {
			return await this.git.show([`${ref}:${path}`]);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (
				/does not exist|bad object|exists on disk, but not in|unknown revision|invalid object name/i.test(
					msg
				)
			) {
				return null;
			}
			throw new GitBackendError(`Failed to read "${path}" at ${ref}: ${msg}`);
		}
	}

	async log(maxCount = 100): Promise<CommitEntry[]> {
		return this.run(async () => {
			const result = await this.git.log({ maxCount });
			return result.all.map((entry) => ({
				hash: entry.hash,
				shortHash: entry.hash.slice(0, 7),
				message: entry.message,
				authorName: entry.author_name,
				date: entry.date,
			}));
		});
	}

	/** Files changed in a commit, compared to its first parent (or the empty tree for a root commit). */
	async changedFilesInCommit(hash: string): Promise<string[]> {
		return this.run(async () => {
			try {
				const diff = await this.git.diffSummary([`${hash}^..${hash}`]);
				return diff.files.map((f) => f.file);
			} catch {
				const diff = await this.git.diffSummary([
					"4b825dc642cb6eb9a060e54bf8d69288fbee4904",
					hash,
				]);
				return diff.files.map((f) => f.file);
			}
		});
	}

	async branchLocal(): Promise<BranchInfo[]> {
		return this.run(async () => {
			const summary = await this.git.branchLocal();
			return summary.all.map((name) => ({ name, current: name === summary.current }));
		});
	}

	async checkoutBranch(name: string): Promise<void> {
		await this.run(() => this.git.checkout(name));
	}

	async createBranch(name: string, from?: string): Promise<void> {
		await this.run(() =>
			from ? this.git.checkoutBranch(name, from) : this.git.checkoutLocalBranch(name)
		);
	}

	async deleteBranch(name: string): Promise<void> {
		await this.run(() => this.git.deleteLocalBranch(name, true));
	}

	async merge(branch: string): Promise<void> {
		await this.run(() => this.git.merge([branch]));
	}

	/** Pulls the current branch, falling back to an explicit `origin/<branch>` (and setting up tracking) when the branch has no upstream configured yet. */
	async pull(): Promise<void> {
		await this.run(async () => {
			try {
				await this.git.pull();
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				if (!/no tracking information|specify which branch/i.test(msg)) throw error;
				const status = await this.git.status();
				if (!status.current) throw error;
				await this.git.pull("origin", status.current);
				await this.git.raw(["branch", `--set-upstream-to=origin/${status.current}`, status.current]);
			}
		});
	}

	/** Pushes the current branch, auto-setting the upstream (`origin/<branch>`) the first time a new branch is pushed. */
	async push(): Promise<void> {
		await this.run(async () => {
			try {
				await this.git.push();
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				const status = /has no upstream branch/i.test(msg) ? await this.git.status() : null;
				if (!status?.current) throw error;
				await this.git.push(["--set-upstream", "origin", status.current]);
			}
		});
	}

	private async run<T>(task: () => Promise<T>): Promise<T> {
		try {
			return await task();
		} catch (error) {
			if (error instanceof GitBackendError) throw error;
			const msg = error instanceof Error ? error.message : String(error);
			throw new GitBackendError(msg.split("\n")[0]);
		}
	}
}
