import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type BigitPlugin from "../main";
import type { CommitEntry } from "../git/types";
import { renderCommitListItem } from "./components/CommitListItem";

export const HISTORY_VIEW_TYPE = "bigit-history";

export class HistoryView extends ItemView {
	private commitListEl!: HTMLElement;
	private detailEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: BigitPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return HISTORY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Commit History";
	}

	getIcon(): string {
		return "history";
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl.createDiv({ cls: "bigit-scm-view" });
		root.createDiv({ cls: "bigit-section-header", text: "Commit History" });
		this.commitListEl = root.createDiv({ cls: "bigit-file-list" });
		this.detailEl = root.createDiv({ cls: "bigit-commit-detail" });

		await this.reload();
	}

	async reload(): Promise<void> {
		this.commitListEl.empty();
		try {
			const commits = await this.plugin.git.log(100);
			for (const commit of commits) {
				renderCommitListItem(this.commitListEl, commit, (c) => void this.showCommit(c));
			}
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async showCommit(commit: CommitEntry): Promise<void> {
		this.detailEl.empty();
		this.detailEl.createDiv({
			cls: "bigit-section-header",
			text: commit.message.split("\n")[0],
		});

		try {
			const files = await this.plugin.git.changedFilesInCommit(commit.hash);
			for (const path of files) {
				const fileRow = this.detailEl.createDiv({ cls: "bigit-file-item" });
				fileRow.createSpan({ cls: "bigit-file-path", text: path });
				fileRow.onclick = () =>
					void this.plugin.openDiff({
						path,
						beforeRef: `${commit.hash}^`,
						afterRef: commit.hash,
						label: commit.message.split("\n")[0],
					});
			}
			if (files.length === 0) {
				this.detailEl.createDiv({ cls: "bigit-diff-page-empty", text: "No file changes." });
			}
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
