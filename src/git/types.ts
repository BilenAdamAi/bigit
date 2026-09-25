export type ChangeStatus = "M" | "A" | "D" | "R" | "U" | "?";

export interface ChangeEntry {
	path: string;
	/** For renames, the original path. */
	from?: string;
	staged: boolean;
	status: ChangeStatus;
}

export interface RepoStatus {
	branch: string | null;
	ahead: number;
	behind: number;
	staged: ChangeEntry[];
	unstaged: ChangeEntry[];
	conflicted: string[];
}

export interface CommitEntry {
	hash: string;
	shortHash: string;
	message: string;
	authorName: string;
	date: string;
}

export interface BranchInfo {
	name: string;
	current: boolean;
}

export type LineMarkerKind = "added" | "modified" | "deleted";

export interface LineMarker {
	line: number;
	kind: LineMarkerKind;
}
