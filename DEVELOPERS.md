# My Project Bridge: for developers

How to test the Bridge and where its code lives. For what it does, see [README.md](README.md); for how to use it, [USER-GUIDE.md](USER-GUIDE.md).

## Tests and tools

- `node test/audit.test.js`: plants one fault per audit rule and checks each is found, and that clean code stays quiet
  (including the false positives found on real projects).
- `node test/disclosure.test.js`: the disclosure pass, each check with a twin that must stay quiet; a planted
  email in git history (pushed and not pushed), on a side branch's commits and in a zip inside a zip; no planted
  value ever comes back out; and the Bridge's own folder scans clean with this PC's real details.
- `node tools/disclose.js [folder]`: the disclosure pass on any folder (the Bridge's own by default); labels only.
- `node test/judged.test.js`: the judged list (set aside, an edited line comes back, a project-wide "false" refused,
  duplicates, report-back import) and each false-flag fix as a must-stay-quiet case with a twin that must still fire.
- `node tools/benchmark.js` (`--missed`, `--only <id>`, `--json <out>`): the scanner's benchmark. `test/museum/`
  holds one small made-up project per kind of real fault (131 kinds from 839 faults found in real projects, plus
  must-stay-quiet cases), each written with the fault and with it fixed. It prints how many kinds the scan
  catches, per bucket (R one-file rule, X across files, L live site, served by little sites on this PC), and how
  many real faults those kinds stand for. `node test/museum.test.js` fails if a kind in `test/museum/baseline.json`
  is no longer caught or a fixed copy is flagged.
- `node test/rules-more.test.js`: every rule in `lib/rules-more.js` fires on one file and stays quiet on the same
  file fixed (written differently from the museum's copies), plus the shapes the rules once flagged wrongly on real
  projects, as must-stay-quiet cases.
- `node test/severity.test.js`: Low and Info never change the verdict and sort last; the ships / repo-only split of the
  disclosure findings; each rule's record ("check this one" after 3+ files set aside, more often than it stands).
- `node test/review.test.js`: the Review with AI prompt (files grouped, no full path, private details as labels) and the
  Findings table (a place and a severity required; status kept on a second import).
- `node test/live-more.test.js`: each live check (headers per file type, old libraries, folder listings, soft 404,
  meta description, canonical, robots.txt against the sitemap, orphan pages, package/composer files, DMARC) fires on
  a made-up site served on this PC and stays quiet on it fixed; DNS answers come from a stand-in.
- `node test/cross.test.js`: every rule in `lib/cross.js` fires on a small made-up project and stays quiet on it
  fixed, plus the shapes these rules once flagged wrongly on real projects (a library function, a policy that covers
  one page, a test suite with its own failure counter ...), as must-stay-quiet projects.
- `node test/roots.test.js`: which folders are taken for old copies of the app (and which are not: `frontend/` and
  `backend/`, a library folder with a version), the notes that name them, and `auditInclude`.
- `node tools/calibrate.js save <out.json>` then `compare <before.json> <after.json>`: the audit over every project in
  your working folders, read-only, before and after a scanner change, with every finding that came or went. Keep the
  saves outside your projects (they name them).
- `node test/gitstate.test.js`: the git marks against little repositories in a temp folder, including a repository
  whose settings try to make `git status` run a program (the Bridge must not run it) and a check that reading never
  rewrites git's index.
- `node test/live.test.js`: Hosted live lights and the live-vs-local compare, against little servers on this PC (a
  made-up https://shop.example/ is routed to them, so nothing leaves the PC), including the 5 s pacing and the stop
  on a firewall page.
- `node test/sensors.test.js`: GPU use adds up the way Task Manager does; on Windows, a real GPU reading arrives and
  the reader does not outlive the Bridge. It also checks the CPU temperature reader (from LibreHardwareMonitor), which
  is switched off (`CPU_TEMP` in `lib/sensors.js`) and not shown.
- `node test/server.test.js`: the whole Bridge as a test copy (port 8485) over a made-up working folder in a temp
  folder: the Host and key checks, every page route, Run local copy, Stop all, hiding, ordering and prompts.
- `node test/setup.test.js`: `install.cmd` / `uninstall.cmd` and Run setup again, with the link, shortcut and Start
  with Windows written to throwaway places instead of your own; and the Git checks, against a stand-in "GitHub" on
  this PC that counts every request (none until the box is ticked).
- `node test/tokens.test.js`: transcripts are read in 1 MB pieces; long lines and characters split between pieces
  come through whole.
- `node test/robust.test.js`: odd project files (bad start entries, a folder called `dev`, names with no plain
  letters) never take the list or the Bridge down and ids never move; two projects on one port, merged alternate
  ports, npm/npx and other Windows scripts, a program that does not exist; live names that resolve to this PC and
  other tenants of a shared host; `--status` against another program; a port holder that never answers; oversized
  requests; the link with an `&` in the folder name.
- `node test/damaged.test.js`: damaged data files (settings, prompts, a saved audit) are read as far as they make
  sense; one that cannot be read is kept beside the fresh one as `<name>.damaged-<time>.json`, so settings and
  prompts are never lost; a request that is not a JSON object is read as empty.
- `node test/snapshot.test.js`: three site pictures in a row all come out and no hidden Edge is left running, even
  one left over from an earlier run (Windows with Microsoft Edge).
- `node server.js --dry-run --port=8487`: a test copy that reports browser, terminal and folder actions instead of
  doing them, with its own settings in `data-dryrun\`. Stop it with `node server.js --stop --port=8487`.
  `BRIDGE_DATA` moves the data folder; `BRIDGE_ROOT` sets the first working folder on a first run.
- `node tools/bench.js`: how long the Bridge takes to start and to list the projects, and how much memory it uses
  (a test copy on port 8488 with throwaway data).

## Where the code is

| Place | What it does |
|---|---|
| `server.js` | Starts the Bridge (or answers `--status` / `--stop`) |
| `lib/config.js` | Version, port, real / test copy / demo, where the data folder is |
| `lib/app.js`, `lib/lifecycle.js` | Listening on 127.0.0.1, first reads at start, stopping cleanly |
| `lib/routes/` | Every API route, by area: `system.js`, `lists.js` (projects and folders), `project.js` (one project's actions), `prompts.js`; `index.js` checks the Host and key and sends each request to its route |
| `lib/state.js` | Settings, the project list, the local copies running, token counts |
| `lib/views.js` | What the page is sent: project rows, the Folders page, This PC |
| `lib/runner.js` | Starting and stopping local copies; programs holding a project's port |
| `lib/setup.js`, `tools/setup.js` | Setup and uninstall (Load Bridge link, desktop shortcut, Start with Windows): `install.cmd` / `uninstall.cmd` run `tools/setup.js`, About runs `lib/setup.js` |
| `lib/git-program.js` | The Git program's version against the last security fix this build knows; the online check for the newest Git (off until ticked) |
| `lib/desktop.js` | Browser, terminal, folder windows and shortcuts (reports instead of opening in a test copy) |
| `lib/platform/` | Every call to the operating system: `windows.js` and its `.ps1` helpers; other systems get `unsupported.js` until they have their own file |
| `lib/projects.js` | Folders, names, descriptions, start commands |
| `lib/audit.js`, `lib/audit-store.js` | The audit and its saved reports |
| `lib/disclosure.js`, `tools/disclose.js` | The disclosure pass (private details, other projects' names, AI trail, local paths; git history, commit emails, zips); `tools/bake.js` uses the same matcher before it zips |
| `lib/judged.js`, `tools/calibrate.js` | The judged list (Not a fault, Bring back, report-back import) kept in `data/judged.json`; the before/after over every project |
| `lib/live.js`, `lib/live-state.js` | Hosted live checks and live vs local |
| `lib/tokens.js`, `lib/tokens-worker.js` | Token counting, off the main thread |
| `lib/gitstate.js`, `lib/prompts.js`, `lib/prompt-starters.js`, `lib/settings.js`, `lib/sensors.js`, `lib/snapshot.js`, `lib/snaps.js`, `lib/ports.js`, `lib/http.js`, `lib/cli.js` | Git marks, saved prompts and their categories, the starter prompts, settings, GPU use, site pictures, icons, port checks, replies and page files, the command line |
| `public/` | The window: `index.html` (markup), `app.css`, `js/` (one file per part of the page, loaded in order; `boot.js` last) |
| `index.html` | The launcher page |
