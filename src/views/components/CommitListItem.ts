import type { CommitEntry } from "../../git/types";

export function renderCommitListItem(
	container: HTMLElement,
	commit: CommitEntry,
	onSelect: (commit: CommitEntry) => void
): HTMLElement {
	const item = container.createDiv({ cls: "bigit-history-commit" });

	const header = item.createDiv();
	header.createSpan({ cls: "bigit-history-commit-hash", text: commit.shortHash });
	header.createSpan({ text: commit.message.split("\n")[0] });

	item.createDiv({
		cls: "bigit-history-commit-meta",
		text: `${commit.authorName} · ${new Date(commit.date).toLocaleString()}`,
	});

	item.onclick = () => onSelect(commit);
	return item;
}
