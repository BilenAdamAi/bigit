import { type EventRef, Notice } from "obsidian";
import type BigitPlugin from "../main";
import type { RepoStatus } from "../git/types";
import { BranchSwitcherModal } from "../modals/BranchSwitcherModal";

export class BranchStatusBarItem {
	private statusRef: EventRef;

	constructor(private plugin: BigitPlugin, private el: HTMLElement) {
		this.el.addClass("bigit-branch-status-item");
		this.el.setText("⎇ …");
		this.el.onclick = () => void this.openSwitcher();
		this.setVisible(plugin.settings.showBranchStatusBar);

		this.statusRef = this.plugin.refreshCoordinator.on("status", (...data: unknown[]) =>
			this.updateLabel(data[0] as RepoStatus)
		);
	}

	setVisible(visible: boolean): void {
		this.el.toggle(visible);
	}

	destroy(): void {
		this.plugin.refreshCoordinator.offref(this.statusRef);
	}

	private updateLabel(status: RepoStatus): void {
		this.el.setText(`⎇ ${status.branch ?? "—"}`);
	}

	private async openSwitcher(): Promise<void> {
		try {
			const branches = await this.plugin.git.branchLocal();
			new BranchSwitcherModal(this.plugin.app, this.plugin, branches).open();
		} catch (error) {
			new Notice(`bigit: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
