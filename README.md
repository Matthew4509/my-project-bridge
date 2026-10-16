# My Project Bridge (Windows)

**All your projects in one window.** A free Windows app for people who keep several websites or web apps on their
PC, especially people who build them with AI coding tools such as Claude Code or Codex.

## TL;DR

- **Lists** every project folder on your PC in one window.
- **Starts** any project's own dev server with one click, and stops it again.
- **Audits** a project for common security faults, and for personal details you would give away by publishing it.
- **Watches** your live sites (up, unsure or down) and your git backups (saved, pushed, or only on this PC).
- **Counts** the AI tokens each project has used (Claude Code and Codex).
- **Stays on your PC.** It never sends your code to an AI or anywhere else, and never changes your projects' files.

## Quick start

1. Download `my-project-bridge-<version>.zip` from this repository's **Releases** page.
2. Unzip it **inside the folder that holds your projects**.
3. Double-click **`install.cmd`**. The Bridge opens with your projects already listed.

Needs Windows 10 or 11 and Node.js 22 or newer (`install.cmd` offers to install it). To try it with made-up projects
first, double-click **`start-demo.cmd`**.

## Good to know

- **Windows only** for now.
- **The audit is a quick check**, not a full security test: a clean audit means "no common faults found", not "safe".
- **Its only requests off your PC** go to the live addresses you add (plus a DNS lookup for them when you scan), and
  a Git version check only if you tick it. Site pictures load your local pages as a browser would, with any fonts
  or scripts they load from the internet.
- **Meant for a PC with one Windows user.**
- **To remove it:** `uninstall.cmd`, then delete the folder. Neither touches your projects.

## More

- **[User guide](USER-GUIDE.md):** every page and button, the audit, safety and privacy, fixes for common problems,
  and what's new.
- **[For developers](DEVELOPERS.md):** tests, tools and a map of the code.
- **Found a problem?** Open an issue: what you did, what you expected, what happened, and the version from **About**.
  Leave out your own folder paths and private details.

## Licence

Free software under the **GNU General Public License, version 3** (GPL-3.0), with **no warranty**. Full text in
[`LICENSE`](LICENSE). Copyright (C) 2026 Matthew4509.
