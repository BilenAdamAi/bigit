import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { LineMarkerKind } from "../git/types";
import { baselineField, setBaseline } from "./baselineField";
import { computeLineMarkers } from "./diffCompute";

const RECOMPUTE_DEBOUNCE_MS = 300;

class DiffGutterMarker extends GutterMarker {
	constructor(readonly kind: LineMarkerKind) {
		super();
	}

	toDOM(): HTMLElement {
		const el = document.createElement("div");
		el.className = `bigit-gutter-marker bigit-gutter-marker-${this.kind}`;
		return el;
	}

	eq(other: GutterMarker): boolean {
		return other instanceof DiffGutterMarker && other.kind === this.kind;
	}
}

function buildMarkers(view: EditorView): RangeSet<GutterMarker> {
	const baseline = view.state.field(baselineField);
	if (baseline === null) return RangeSet.empty;

	const current = view.state.doc.toString();
	const builder = new RangeSetBuilder<GutterMarker>();
	for (const marker of computeLineMarkers(baseline, current)) {
		const lineNumber = Math.min(Math.max(marker.line, 1), view.state.doc.lines);
		const line = view.state.doc.line(lineNumber);
		builder.add(line.from, line.from, new DiffGutterMarker(marker.kind));
	}
	return builder.finish();
}

const diffGutterPlugin = ViewPlugin.fromClass(
	class {
		markers: RangeSet<GutterMarker>;
		private timeout: number | null = null;

		constructor(view: EditorView) {
			this.markers = buildMarkers(view);
		}

		update(update: ViewUpdate): void {
			const baselineChanged = update.transactions.some((tr) =>
				tr.effects.some((effect) => effect.is(setBaseline))
			);
			if (!update.docChanged && !baselineChanged) return;

			if (this.timeout !== null) {
				window.clearTimeout(this.timeout);
				this.timeout = null;
			}

			if (baselineChanged) {
				// Baseline just loaded (e.g. switched files) - reflect it immediately.
				this.markers = buildMarkers(update.view);
				return;
			}

			// Debounce recompute-on-keystroke so we're not diffing on every char.
			this.timeout = window.setTimeout(() => {
				this.timeout = null;
				this.markers = buildMarkers(update.view);
				update.view.dispatch({}); // nudge the gutter to re-read `markers`
			}, RECOMPUTE_DEBOUNCE_MS);
		}

		destroy(): void {
			if (this.timeout !== null) window.clearTimeout(this.timeout);
		}
	}
);

export function diffGutterExtension() {
	return [
		baselineField,
		diffGutterPlugin,
		gutter({
			class: "bigit-diff-gutter",
			markers: (view) => view.plugin(diffGutterPlugin)?.markers ?? RangeSet.empty,
		}),
	];
}
