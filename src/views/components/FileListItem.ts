import { setIcon } from "obsidian";
import type { ChangeEntry, ChangeStatus } from "../../git/types";

export interface FileListItemActions {
	onToggleDiff: (path: string) => void;
	onStage?: (path: string) => void;
	onUnstage?: (path: string) => void;
	onDiscard?: (path: string) => void;
}

function statusLabel(status: ChangeStatus): string {
	switch (status) {
		case "M":
			return "Modified";
		case "A":
			return "Added";
		case "D":
			return "Deleted";
		case "R":
			return "Renamed";
		case "U":
			return "Unmerged";
		case "?":
			return "Untracked";
	}
}

function addActionButton(
	container: HTMLElement,
	icon: string,
	label: string,
	onClick: (evt: MouseEvent) => void
): void {
	const btn = container.createEl("button", { cls: "clickable-icon" });
	setIcon(btn, icon);
	btn.setAttr("aria-label", label);
	btn.onclick = (evt) => {
		evt.stopPropagation();
		onClick(evt);
	};
}

export function renderFileListItem(
	container: HTMLElement,
	entry: ChangeEntry,
	actions: FileListItemActions
): HTMLElement {
	const item = container.createDiv({ cls: "bigit-file-item" });

	const status = item.createSpan({
		cls: `bigit-file-status bigit-file-status-${entry.status}`,
		text: entry.status,
	});
	status.setAttr("aria-label", statusLabel(entry.status));

	const path = item.createSpan({ cls: "bigit-file-path", text: entry.path });
	path.setAttr("title", entry.path);

	const actionsEl = item.createDiv({ cls: "bigit-file-actions" });
	if (actions.onStage) {
		addActionButton(actionsEl, "plus", "Stage", () => actions.onStage?.(entry.path));
	}
	if (actions.onUnstage) {
		addActionButton(actionsEl, "minus", "Unstage", () => actions.onUnstage?.(entry.path));
	}
	if (actions.onDiscard) {
		addActionButton(actionsEl, "undo-2", "Discard changes", () => actions.onDiscard?.(entry.path));
	}

	item.onclick = () => actions.onToggleDiff(entry.path);

	return item;
}
