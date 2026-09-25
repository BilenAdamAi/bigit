import { describe, expect, it } from "vitest";
import { computeLineMarkers } from "./diffCompute";

describe("computeLineMarkers", () => {
	it("returns no markers when content is unchanged", () => {
		const text = "a\nb\nc\n";
		expect(computeLineMarkers(text, text)).toEqual([]);
	});

	it("marks a pure addition", () => {
		const baseline = "a\nb\nc\n";
		const current = "a\nb\nX\nc\n";
		expect(computeLineMarkers(baseline, current)).toEqual([{ line: 3, kind: "added" }]);
	});

	it("marks a pure deletion against the following line", () => {
		const baseline = "a\nb\nc\nd\n";
		const current = "a\nb\nd\n";
		expect(computeLineMarkers(baseline, current)).toEqual([{ line: 3, kind: "deleted" }]);
	});

	it("marks a deletion at end of file one line past the last remaining line", () => {
		// There's no following line to attach the marker to; callers (the CM6
		// gutter) clamp this to the last valid line when rendering.
		const baseline = "a\nb\nc\n";
		const current = "a\nb\n";
		const markers = computeLineMarkers(baseline, current);
		expect(markers).toEqual([{ line: 3, kind: "deleted" }]);
	});

	it("marks an equal-length replacement as modified", () => {
		const baseline = "a\nb\nc\n";
		const current = "a\nX\nc\n";
		expect(computeLineMarkers(baseline, current)).toEqual([{ line: 2, kind: "modified" }]);
	});

	it("splits a shrinking replacement into modified + deleted", () => {
		const baseline = "a\nb\nc\nd\ne\n";
		const current = "a\nX\ne\n";
		expect(computeLineMarkers(baseline, current)).toEqual([
			{ line: 2, kind: "modified" },
			{ line: 3, kind: "deleted" },
		]);
	});

	it("splits a growing replacement into modified + added", () => {
		const baseline = "a\nb\ne\n";
		const current = "a\nX\nY\nZ\ne\n";
		expect(computeLineMarkers(baseline, current)).toEqual([
			{ line: 2, kind: "modified" },
			{ line: 3, kind: "added" },
			{ line: 4, kind: "added" },
		]);
	});

	it("marks an entirely new file as fully added", () => {
		const current = "a\nb\nc\n";
		expect(computeLineMarkers("", current)).toEqual([
			{ line: 1, kind: "added" },
			{ line: 2, kind: "added" },
			{ line: 3, kind: "added" },
		]);
	});
});
