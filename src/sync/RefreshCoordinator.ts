import { debounce, Events } from "obsidian";
import type BigitPlugin from "../main";
import type { RepoStatus } from "../git/types";

const VAULT_EVENT_DEBOUNCE_MS = 500;

/**
 * Single funnel for everything that should trigger a `git status` refresh:
 * debounced vault events, a configurable poll interval, window focus, and
 * direct calls after a plugin-initiated mutation (stage/commit/checkout/...).
 * Overlapping refresh requests are coalesced via `pending`/`dirty` so we never
 * have more than one `git status` process in flight at a time.
 */
export class RefreshCoordinator extends Events {
	lastStatus: RepoStatus | null = null;

	private intervalId: number | null = null;
	private pending: Promise<void> | null = null;
	private dirty = false;
	private readonly debouncedRefresh = debounce(
		() => void this.refresh(),
		VAULT_EVENT_DEBOUNCE_MS,
		true
	);

	constructor(private plugin: BigitPlugin) {
		super();
	}

	start(): void {
		const { vault } = this.plugin.app;
		this.plugin.registerEvent(vault.on("create", () => this.debouncedRefresh()));
		this.plugin.registerEvent(vault.on("modify", () => this.debouncedRefresh()));
		this.plugin.registerEvent(vault.on("delete", () => this.debouncedRefresh()));
		this.plugin.registerEvent(vault.on("rename", () => this.debouncedRefresh()));
		this.plugin.registerDomEvent(window, "focus", () => this.debouncedRefresh());

		this.restart();
		void this.refresh();
	}

	/** (Re)starts the poll interval from current settings. Safe to call after a settings change. */
	restart(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
		const seconds = this.plugin.settings.autoRefreshInterval;
		if (seconds > 0) {
			this.intervalId = this.plugin.registerInterval(
				window.setInterval(() => void this.refresh(), seconds * 1000)
			);
		}
	}

	async refresh(): Promise<void> {
		if (this.pending) {
			this.dirty = true;
			return this.pending;
		}

		this.pending = this.doRefresh();
		try {
			await this.pending;
		} finally {
			this.pending = null;
			if (this.dirty) {
				this.dirty = false;
				void this.refresh();
			}
		}
	}

	private async doRefresh(): Promise<void> {
		try {
			this.lastStatus = await this.plugin.git.status();
			this.trigger("status", this.lastStatus);
		} catch (error) {
			this.trigger("error", error);
		}
	}
}
