import { diffLines } from "diff";
import type { LineMarker } from "../git/types";

/**
 * Classifies the diff between `baseline` (e.g. the file's content at HEAD) and
 * `current` (the live editor buffer) into per-line markers positioned against
 * `current`'s line numbers (1-indexed) — the shape a CM6 gutter needs.
 *
 * A run of removed lines immediately followed by a run of added lines is
 * treated as a "modified" pair for the overlapping line count (VSCode's
 * convention), with any excess lines classified as pure added/deleted.
 */
export function computeLineMarkers(baseline: string, current: string): LineMarker[] {
	const changes = diffLines(baseline, current);
	const markers: LineMarker[] = [];
	let line = 1;

	for (let i = 0; i < changes.length; i++) {
		const change = changes[i];

		if (!change.added && !change.removed) {
			line += change.count ?? 0;
			continue;
		}

		if (change.added) {
			// A pure addition (any preceding removal was already consumed below).
			const count = change.count ?? 0;
			for (let j = 0; j < count; j++) {
				markers.push({ line: line + j, kind: "added" });
			}
			line += count;
			continue;
		}

		// change.removed
		const removedCount = change.count ?? 0;
		const next = changes[i + 1];
		const addedCount = next?.added ? next.count ?? 0 : 0;
		const pairCount = Math.min(removedCount, addedCount);

		for (let j = 0; j < pairCount; j++) {
			markers.push({ line: line + j, kind: "modified" });
		}
		for (let j = pairCount; j < addedCount; j++) {
			markers.push({ line: line + j, kind: "added" });
		}
		if (removedCount > addedCount) {
			markers.push({ line: line + addedCount, kind: "deleted" });
		}

		line += addedCount;
		if (next?.added) {
			i++; // consume the paired addition, already accounted for above
		}
	}

	return markers;
}

export interface DiffLineBlock {
	type: "context" | "added" | "removed";
	lines: string[];
}

/** Full-file diff for display (e.g. history/commit diff view), reusing the same diffLines pass. */
export function computeDiffBlocks(baseline: string, current: string): DiffLineBlock[] {
	return diffLines(baseline, current).map((change) => ({
		type: change.added ? "added" : change.removed ? "removed" : "context",
		lines: change.value.replace(/\n$/, "").split("\n"),
	}));
}
