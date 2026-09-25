import { ItemView, Notice, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type BigitPlugin from "../main";
import { computeDiffBlocks } from "../editor/diffCompute";

export const DIFF_VIEW_TYPE = "bigit-diff";

export interface DiffViewState {
	path: string;
	beforeRef: string;
	/** null = compare against the file's current content in the vault (the live working tree). */
	afterRef: string | null;
	/** Optional context shown under the title, e.g. a commit message. */
	label?: string;
}

function isDiffViewState(state: unknown): state is DiffViewState {
	if (!state || typeof state !== "object") return false;
	const candidate = state as Record<string, unknown>;
	return typeof candidate.path === "string" && typeof candidate.beforeRef === "string";
}

/** A full-tab diff view (opened in the main workspace area, like VSCode's diff editor), instead of a cramped inline diff in a sidebar. */
export class DiffView extends ItemView {
	private diffState: DiffViewState | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: BigitPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return DIFF_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (!this.diffState) return "Diff";
		const name = this.diffState.path.split("/").pop();
		return name ?? this.diffState.path;
	}

	getIcon(): string {
		return "diff";
	}

	getState(): Record<string, unknown> {
		return this.diffState ? { ...this.diffState } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (isDiffViewState(state)) {
			this.diffState = state;
			await this.render();
		}
	}

	protected async onOpen(): Promise<void> {
		this.contentEl.addClass("bigit-diff-view");
		await this.render();
	}

	private async render(): Promise<void> {
		this.contentEl.empty();
		if (!this.diffState) {
			this.contentEl.createDiv({ text: "No file selected." });
			return;
		}
		const { path, beforeRef, afterRef, label } = this.diffState;

		const header = this.contentEl.createDiv({ cls: "bigit-diff-page-header" });
		header.createDiv({ cls: "bigit-diff-page-title", text: path });
		if (label) {
			header.createDiv({ cls: "bigit-diff-page-subtitle", text: label });
		}

		const body = this.contentEl.createDiv({ cls: "bigit-diff-page-body" });

		try {
			const before = (await this.plugin.git.getFileAtRef(beforeRef, path)) ?? "";
			let after: string;
			if (afterRef === null) {
				const file = this.plugin.app.vault.getAbstractFileByPath(path);
				after = file instanceof TFile ? await this.plugin.app.vault.read(file) : "";
			} else {
				after = (await this.plugin.git.getFileAtRef(afterRef, path)) ?? "";
			}
			this.renderRows(body, before, after);
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private renderRows(container: HTMLElement, baseline: string, current: string): void {
		if (baseline === current) {
			container.createDiv({ cls: "bigit-diff-page-empty", text: "No changes." });
			return;
		}

		let oldLine = 1;
		let newLine = 1;

		for (const block of computeDiffBlocks(baseline, current)) {
			for (const line of block.lines) {
				const row = container.createDiv({ cls: `bigit-diff-row bigit-diff-row-${block.type}` });
				row.createSpan({
					cls: "bigit-diff-linenum",
					text: block.type === "added" ? "" : String(oldLine),
				});
				row.createSpan({
					cls: "bigit-diff-linenum",
					text: block.type === "removed" ? "" : String(newLine),
				});
				const prefix = block.type === "added" ? "+" : block.type === "removed" ? "-" : " ";
				row.createSpan({ cls: "bigit-diff-linetext", text: `${prefix} ${line}` });

				if (block.type !== "added") oldLine++;
				if (block.type !== "removed") newLine++;
			}
		}
	}
}
