import type { EditorView } from "@codemirror/view";
import { FileSystemAdapter, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { setBaseline } from "./editor/baselineField";
import { diffGutterExtension } from "./editor/diffGutter";
import { GitBackendError, GitService } from "./git/GitService";
import { BigitSettingTab, DEFAULT_SETTINGS, type BigitSettings } from "./settings";
import { BranchStatusBarItem } from "./statusbar/BranchStatusBarItem";
import { RefreshCoordinator } from "./sync/RefreshCoordinator";
import { DIFF_VIEW_TYPE, DiffView, type DiffViewState } from "./views/DiffView";
import { HISTORY_VIEW_TYPE, HistoryView } from "./views/HistoryView";
import { SCM_VIEW_TYPE, SourceControlView } from "./views/SourceControlView";
import { BranchSwitcherModal } from "./modals/BranchSwitcherModal";

export default class BigitPlugin extends Plugin {
	settings!: BigitSettings;
	git!: GitService;
	refreshCoordinator!: RefreshCoordinator;
	branchStatusBarItem: BranchStatusBarItem | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.initializeGitService();
		void this.validateGitSetup();

		// Created early and before anything else, since several components below
		// (e.g. BranchStatusBarItem) subscribe to it from their constructors.
		this.refreshCoordinator = new RefreshCoordinator(this);
		this.refreshCoordinator.start();
		this.registerEvent(
			this.refreshCoordinator.on("error", (...data: unknown[]) => {
				const error = data[0];
				new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
			})
		);

		this.registerView(SCM_VIEW_TYPE, (leaf) => new SourceControlView(leaf, this));
		this.registerView(HISTORY_VIEW_TYPE, (leaf) => new HistoryView(leaf, this));
		this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf, this));

		this.addRibbonIcon("git-branch", "Open bigit source control", () => {
			void this.activateView(SCM_VIEW_TYPE);
		});

		this.registerEditorExtension(diffGutterExtension());

		this.branchStatusBarItem = new BranchStatusBarItem(this, this.addStatusBarItem());

		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshActiveBaseline()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.refreshActiveBaseline()));
		this.registerEvent(this.refreshCoordinator.on("status", () => this.refreshActiveBaseline()));

		this.addSettingTab(new BigitSettingTab(this));

		this.addCommand({
			id: "bigit-open-scm",
			name: "Open source control panel",
			callback: () => void this.activateView(SCM_VIEW_TYPE),
		});
		this.addCommand({
			id: "bigit-open-history",
			name: "Open commit history",
			callback: () => void this.activateView(HISTORY_VIEW_TYPE),
		});
		this.addCommand({
			id: "bigit-refresh",
			name: "Refresh git status",
			callback: () => void this.refreshCoordinator.refresh(),
		});
		this.addCommand({
			id: "bigit-switch-branch",
			name: "Switch branch",
			callback: () => void this.openBranchSwitcher(),
		});
		this.addCommand({
			id: "bigit-pull",
			name: "Pull",
			callback: () => void this.runGitCommand(() => this.git.pull(), "pulled"),
		});
		this.addCommand({
			id: "bigit-push",
			name: "Push",
			callback: () => void this.runGitCommand(() => this.git.push(), "pushed"),
		});
	}

	onunload(): void {
		this.branchStatusBarItem?.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Re-creates the GitService after the repo path setting changes. */
	async reinitializeGitService(): Promise<void> {
		this.initializeGitService();
		await this.validateGitSetup();
		await this.refreshCoordinator?.refresh();
	}

	private initializeGitService(): void {
		this.git = new GitService({
			baseDir: this.resolveRepoRoot(),
			binaryPath: this.settings.gitBinaryPath,
		});
	}

	private resolveRepoRoot(): string {
		const adapter = this.app.vault.adapter;
		const vaultRoot = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
		return this.settings.repoPath ? `${vaultRoot}/${this.settings.repoPath}` : vaultRoot;
	}

	private async validateGitSetup(): Promise<void> {
		try {
			await GitService.validateBinary(this.settings.gitBinaryPath);
		} catch (error) {
			new Notice(`bigit: ${error instanceof GitBackendError ? error.message : String(error)}`);
			return;
		}

		const isRepo = await this.git.isRepo();
		if (!isRepo) {
			new Notice(
				`bigit: "${this.git.baseDir}" is not a git repository. Configure the repository location in bigit's settings, or run "git init".`
			);
		}
	}

	private async activateView(viewType: string): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(viewType);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: viewType, active: true });
		await workspace.revealLeaf(leaf);
	}

	/** Opens (or updates) a single full-tab diff view in the main workspace area, VSCode-diff-editor style. */
	async openDiff(state: DiffViewState): Promise<void> {
		const { workspace } = this.app;
		const leaf = workspace.getLeavesOfType(DIFF_VIEW_TYPE)[0] ?? workspace.getLeaf("tab");
		await leaf.setViewState({
			type: DIFF_VIEW_TYPE,
			active: true,
			state: state as unknown as Record<string, unknown>,
		});
		await workspace.revealLeaf(leaf);
	}

	private async runGitCommand(fn: () => Promise<void>, verb: string): Promise<void> {
		try {
			await fn();
			new Notice(`bigit: ${verb}`);
			await this.refreshCoordinator.refresh();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async openBranchSwitcher(): Promise<void> {
		try {
			const branches = await this.git.branchLocal();
			new BranchSwitcherModal(this.app, this, branches).open();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** Pushes the active markdown file's baseline (HEAD or index content) into its live CM6 instance for the diff gutter. */
	private refreshActiveBaseline(): void {
		if (!this.settings.enableGutters) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (!view || !file || !(file instanceof TFile)) return;

		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) return;

		const ref = this.settings.gutterBaseline === "index" ? "" : "HEAD";
		void this.git.getFileAtRef(ref, file.path).then(
			(content) => cm.dispatch({ effects: setBaseline.of(content ?? "") }),
			() => cm.dispatch({ effects: setBaseline.of(null) })
		);
	}
}
