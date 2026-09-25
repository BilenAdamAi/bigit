import { Notice, PluginSettingTab, Setting } from "obsidian";
import type BigitPlugin from "./main";
import { GitService } from "./git/GitService";

export type GutterBaseline = "HEAD" | "index";

export interface BigitSettings {
	gitBinaryPath: string;
	/** Path to the repo root, relative to the vault root. Empty string = vault root. */
	repoPath: string;
	/** Seconds between automatic status polls. 0 disables polling (manual/focus/event refresh only). */
	autoRefreshInterval: number;
	enableGutters: boolean;
	gutterBaseline: GutterBaseline;
	confirmBeforeDiscard: boolean;
	showBranchStatusBar: boolean;
}

export const DEFAULT_SETTINGS: BigitSettings = {
	gitBinaryPath: "git",
	repoPath: "",
	autoRefreshInterval: 5,
	enableGutters: true,
	gutterBaseline: "HEAD",
	confirmBeforeDiscard: true,
	showBranchStatusBar: true,
};

export class BigitSettingTab extends PluginSettingTab {
	constructor(private plugin: BigitPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.plugin.settings;

		new Setting(containerEl)
			.setName("Git binary path")
			.setDesc('Path to the git executable. Defaults to "git" (resolved via PATH).')
			.addText((text) =>
				text
					.setPlaceholder("git")
					.setValue(settings.gitBinaryPath)
					.onChange(async (value) => {
						settings.gitBinaryPath = value.trim() || "git";
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button.setButtonText("Validate").onClick(async () => {
					try {
						const version = await GitService.validateBinary(settings.gitBinaryPath);
						new Notice(`bigit: found ${version}`);
					} catch (error) {
						new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
					}
				})
			);

		new Setting(containerEl)
			.setName("Repository location")
			.setDesc("Path to the git repository, relative to the vault root. Leave empty to use the vault root.")
			.addText((text) =>
				text
					.setPlaceholder("(vault root)")
					.setValue(settings.repoPath)
					.onChange(async (value) => {
						settings.repoPath = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.reinitializeGitService();
					})
			);

		new Setting(containerEl)
			.setName("Auto-refresh interval")
			.setDesc("Seconds between automatic status polls. Set to 0 to refresh manually (or on focus/edits) only.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 60, 1)
					.setValue(settings.autoRefreshInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						settings.autoRefreshInterval = value;
						await this.plugin.saveSettings();
						this.plugin.refreshCoordinator?.restart();
					})
			);

		new Setting(containerEl)
			.setName("Enable inline diff gutters")
			.setDesc("Show added/modified/deleted line markers in the editor gutter, like VSCode.")
			.addToggle((toggle) =>
				toggle.setValue(settings.enableGutters).onChange(async (value) => {
					settings.enableGutters = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Diff gutter baseline")
			.setDesc("Compare the editor content against the file at HEAD (last commit) or the staged index.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("HEAD", "HEAD (last commit)")
					.addOption("index", "Index (staged)")
					.setValue(settings.gutterBaseline)
					.onChange(async (value) => {
						settings.gutterBaseline = value as GutterBaseline;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Confirm before discarding changes")
			.setDesc("Show a confirmation dialog before discarding uncommitted changes to a file.")
			.addToggle((toggle) =>
				toggle.setValue(settings.confirmBeforeDiscard).onChange(async (value) => {
					settings.confirmBeforeDiscard = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show branch status bar item")
			.setDesc("Show the current branch name in the status bar, click to switch branches.")
			.addToggle((toggle) =>
				toggle.setValue(settings.showBranchStatusBar).onChange(async (value) => {
					settings.showBranchStatusBar = value;
					await this.plugin.saveSettings();
					this.plugin.branchStatusBarItem?.setVisible(value);
				})
			);
	}
}
