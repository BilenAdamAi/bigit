import { type EventRef, ItemView, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import type BigitPlugin from "../main";
import type { ChangeEntry, RepoStatus } from "../git/types";
import { renderFileListItem } from "./components/FileListItem";
import { ConfirmDiscardModal } from "../modals/ConfirmDiscardModal";

export const SCM_VIEW_TYPE = "bigit-source-control";

export class SourceControlView extends ItemView {
	private statusRef: EventRef | null = null;
	private latestStatus: RepoStatus | null = null;

	private commitInput!: HTMLTextAreaElement;
	private commitButton!: HTMLButtonElement;
	private commitPushButton!: HTMLButtonElement;
	private stageAllButton!: HTMLButtonElement;
	private pullButton!: HTMLButtonElement;
	private pushButton!: HTMLButtonElement;
	private conflictBannerEl!: HTMLElement;
	private stagedListEl!: HTMLElement;
	private unstagedListEl!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: BigitPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return SCM_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Source Control";
	}

	getIcon(): string {
		return "git-branch";
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl.createDiv({ cls: "bigit-scm-view" });

		const header = root.createDiv({ cls: "bigit-section-header" });
		header.createSpan({ text: "Source Control" });
		const headerActions = header.createDiv({ cls: "bigit-header-actions" });

		this.pullButton = headerActions.createEl("button", { cls: "clickable-icon" });
		setIcon(this.pullButton, "arrow-down-to-line");
		this.pullButton.setAttr("aria-label", "Pull");
		this.pullButton.onclick = () => void this.pull();

		this.pushButton = headerActions.createEl("button", { cls: "clickable-icon" });
		setIcon(this.pushButton, "arrow-up-to-line");
		this.pushButton.setAttr("aria-label", "Push");
		this.pushButton.onclick = () => void this.push();

		const refreshBtn = headerActions.createEl("button", { cls: "clickable-icon" });
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.setAttr("aria-label", "Refresh");
		refreshBtn.onclick = () => void this.plugin.refreshCoordinator.refresh();

		this.conflictBannerEl = root.createDiv({ cls: "bigit-conflict-banner mod-warning" });
		this.conflictBannerEl.hide();

		const commitBox = root.createDiv({ cls: "bigit-commit-box" });
		this.commitInput = commitBox.createEl("textarea", {
			attr: { placeholder: "Commit message (Ctrl/Cmd+Enter to commit)" },
		});
		this.commitInput.addEventListener("keydown", (evt) => {
			if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
				evt.preventDefault();
				void this.commit();
			}
		});
		this.commitInput.addEventListener("input", () => this.updateCommitButtonState());
		const commitButtons = commitBox.createDiv({ cls: "bigit-commit-buttons" });
		this.commitButton = commitButtons.createEl("button", { text: "Commit", cls: "mod-cta" });
		this.commitButton.onclick = () => void this.commit();
		this.commitPushButton = commitButtons.createEl("button", { text: "Commit & Push" });
		this.commitPushButton.onclick = () => void this.commit(true);

		root.createDiv({ cls: "bigit-section-header", text: "Staged Changes" });
		this.stagedListEl = root.createDiv({ cls: "bigit-file-list" });

		const changesHeader = root.createDiv({ cls: "bigit-section-header" });
		changesHeader.createSpan({ text: "Changes" });
		this.stageAllButton = changesHeader.createEl("button", { cls: "clickable-icon" });
		setIcon(this.stageAllButton, "plus");
		this.stageAllButton.setAttr("aria-label", "Stage all changes");
		this.stageAllButton.onclick = () => void this.stageAll();
		this.unstagedListEl = root.createDiv({ cls: "bigit-file-list" });

		this.statusRef = this.plugin.refreshCoordinator.on("status", (...data: unknown[]) =>
			this.render(data[0] as RepoStatus)
		);
		if (this.plugin.refreshCoordinator.lastStatus) {
			this.render(this.plugin.refreshCoordinator.lastStatus);
		}
		void this.plugin.refreshCoordinator.refresh();
	}

	protected async onClose(): Promise<void> {
		if (this.statusRef) {
			this.plugin.refreshCoordinator.offref(this.statusRef);
			this.statusRef = null;
		}
	}

	private render(status: RepoStatus): void {
		this.latestStatus = status;

		if (status.conflicted.length > 0) {
			this.conflictBannerEl.setText(
				`${status.conflicted.length} file(s) have merge conflicts — resolve manually.`
			);
			this.conflictBannerEl.show();
		} else {
			this.conflictBannerEl.hide();
		}

		this.stagedListEl.empty();
		for (const entry of status.staged) {
			renderFileListItem(this.stagedListEl, entry, {
				onToggleDiff: (path) => this.openFileDiff(path),
				onUnstage: (path) => this.runGitAction(() => this.plugin.git.unstage([path])),
			});
		}

		this.unstagedListEl.empty();
		for (const entry of status.unstaged) {
			renderFileListItem(this.unstagedListEl, entry, {
				onToggleDiff: (path) => this.openFileDiff(path),
				onStage: (path) => this.runGitAction(() => this.plugin.git.stage([path])),
				onDiscard: () => this.confirmDiscard(entry),
			});
		}
		this.stageAllButton.disabled = status.unstaged.length === 0;

		this.pullButton.setAttr("aria-label", status.behind > 0 ? `Pull (${status.behind})` : "Pull");
		this.pushButton.setAttr("aria-label", status.ahead > 0 ? `Push (${status.ahead})` : "Push");

		this.updateCommitButtonState();
	}

	private updateCommitButtonState(): void {
		const hasStaged = (this.latestStatus?.staged.length ?? 0) > 0;
		const hasMessage = this.commitInput.value.trim().length > 0;
		const disabled = !(hasStaged && hasMessage);
		this.commitButton.disabled = disabled;
		this.commitPushButton.disabled = disabled;
	}

	private async commit(push = false): Promise<void> {
		if (this.commitButton.disabled) return;
		try {
			await this.plugin.git.commit(this.commitInput.value);
			this.commitInput.value = "";
			new Notice("bigit: committed");
			if (push) {
				await this.plugin.git.push();
				new Notice("bigit: pushed");
			}
			await this.plugin.refreshCoordinator.refresh();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async pull(): Promise<void> {
		this.pullButton.disabled = true;
		try {
			await this.plugin.git.pull();
			new Notice("bigit: pulled");
			await this.plugin.refreshCoordinator.refresh();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.pullButton.disabled = false;
		}
	}

	private async push(): Promise<void> {
		this.pushButton.disabled = true;
		try {
			await this.plugin.git.push();
			new Notice("bigit: pushed");
			await this.plugin.refreshCoordinator.refresh();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.pushButton.disabled = false;
		}
	}

	private async runGitAction(fn: () => Promise<void>): Promise<void> {
		try {
			await fn();
			await this.plugin.refreshCoordinator.refresh();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private confirmDiscard(entry: ChangeEntry): void {
		const discard = async () => {
			if (entry.status === "?") {
				await this.plugin.app.vault.adapter.remove(entry.path);
			} else {
				await this.plugin.git.discardTracked([entry.path]);
			}
			await this.plugin.refreshCoordinator.refresh();
		};

		if (this.plugin.settings.confirmBeforeDiscard) {
			new ConfirmDiscardModal(this.plugin.app, entry.path, () => void discard()).open();
		} else {
			void discard();
		}
	}

	private stageAll(): Promise<void> {
		const paths = this.latestStatus?.unstaged.map((entry) => entry.path) ?? [];
		return this.runGitAction(() => this.plugin.git.stage(paths));
	}

	private openFileDiff(path: string): void {
		void this.plugin.openDiff({ path, beforeRef: "HEAD", afterRef: null });
	}
}
