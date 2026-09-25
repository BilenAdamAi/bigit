import { type App, Modal, Setting } from "obsidian";

export class ConfirmDiscardModal extends Modal {
	constructor(app: App, private path: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Discard changes?");
		this.contentEl.createEl("p", {
			text: `This will permanently discard uncommitted changes to "${this.path}". This cannot be undone.`,
		});

		new Setting(this.contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Discard changes")
					.setWarning()
					.onClick(() => {
						this.close();
						this.onConfirm();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
