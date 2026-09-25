import { StateEffect, StateField } from "@codemirror/state";

/**
 * Dispatched to push the file's baseline content (its text at the configured
 * git ref) into a CM6 instance. `null` means "not loaded yet" (no gutter
 * markers shown); `""` means the file doesn't exist at that ref (a new,
 * untracked file), so the whole buffer renders as added.
 */
export const setBaseline = StateEffect.define<string | null>();

export const baselineField = StateField.define<string | null>({
	create() {
		return null;
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setBaseline)) {
				return effect.value;
			}
		}
		return value;
	},
});
