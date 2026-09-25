# bigit

A VSCode-style interactive source control panel for your Obsidian vault — stage/unstage individual files, commit, push/pull, browse history, and see inline diff gutters in the editor. Desktop only.

Unlike the popular [Obsidian Git](https://github.com/Vinzent03/obsidian-git) plugin (which focuses on scheduled auto-backup commit/push/pull), bigit is built around an interactive, click-driven workflow: a real source-control sidebar, a full-tab diff view, and gutter markers as you type — closer to how git works in VSCode.

## Features

- **Source Control panel** — staged/unstaged file lists, stage/unstage individual files or all at once, discard changes, commit with a message box (`Ctrl`/`Cmd`+`Enter` to commit)
- **Push / Pull** — buttons in the panel header (with ahead/behind badges) and a **Commit & Push** button; automatically sets up the upstream branch on first push
- **Inline diff gutters** — green/yellow/red markers in the editor margin showing added/modified/deleted lines, computed against `HEAD` (or the staged index, configurable)
- **Diff view** — clicking a changed file (or a file inside a commit) opens a full-tab diff with old/new line numbers, instead of a cramped inline preview
- **Commit history** — browse the commit log, expand a commit to see its changed files
- **Branch switching** — status bar item showing the current branch; click to fuzzy-search/switch/create branches
- **Merge conflicts** are surfaced as a banner/notice rather than an in-app resolution UI — resolve them with your usual git tooling

## Requirements

- Desktop Obsidian (this plugin is marked `isDesktopOnly` — it shells out to a real `git` binary via Node, which isn't available on mobile)
- [Git](https://git-scm.com/) installed and on your `PATH` (or point bigit at a specific binary in settings)
- Your vault (or a folder inside it) must be a git repository — run `git init` if it isn't yet

## Installation

bigit isn't in the Community Plugins store yet, so install it manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from a [release](https://github.com/BilenAdamAi/bigit/releases) (or build from source, see below)
2. Copy them into `<your-vault>/.obsidian/plugins/bigit/`
3. In Obsidian, go to **Settings → Community plugins** and enable **bigit**

## Settings

| Setting | Default | Description |
|---|---|---|
| Git binary path | `git` | Path to the git executable; has a "Validate" button that runs `git --version` |
| Repository location | *(vault root)* | Path to the repo, relative to the vault root, if it's not the vault root itself |
| Auto-refresh interval | `5s` | How often to poll `git status`; `0` disables polling (status still refreshes on file changes, window focus, and after any bigit action) |
| Enable inline diff gutters | on | Toggles the editor gutter markers |
| Diff gutter baseline | `HEAD` | Compare the editor buffer against `HEAD` or the staged index |
| Confirm before discarding changes | on | Show a confirmation dialog before discarding uncommitted changes |
| Show branch status bar item | on | Toggles the branch name/switcher in the status bar |

## Development

```bash
npm install
npm run dev      # esbuild watch build
npm run build    # typecheck + production build
npm test               # unit tests (vitest)
npm run test:integration  # integration tests against a real temp git repo
```

To try changes in a real vault, copy (or symlink, on a same-OS setup) `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/bigit/`, then reload the plugin from **Settings → Community plugins**.

## Non-goals (for now)

- Mobile support
- In-app merge conflict resolution (conflicts are reported, not editable, in-app)

## License

[MIT](LICENSE)
