# My Project Bridge: user guide

Everything in detail. The short version is in [README.md](README.md).

**Contents:** [What you need](#what-you-need) · [Install and start](#install-and-start) · [Your first five minutes](#your-first-five-minutes) · [The window](#the-window) · [Demo](#demo) · [Where start commands come from](#where-start-commands-come-from) · [Names and descriptions](#names-and-descriptions-projectsjson) · [The built-in audit](#the-built-in-audit) · [Safety and privacy](#safety-and-privacy) · [If something goes wrong](#if-something-goes-wrong) · [Questions](#questions) · [Report a problem](#report-a-problem) · [What's new](#whats-new-in-0106)

## What you need

- **Windows 10 or 11** with **Microsoft Edge** (it ships with Windows). Mac and Linux: see [the questions below](#questions).
- **Node.js 22 or newer**: `install.cmd` checks, and offers to install the LTS version for you with winget
  (Windows' own installer). Or get it from <https://nodejs.org>, default options. Nothing else to install: no npm
  packages, no admin rights.

## Install and start

1. Download the zip from the repository's **Releases** page and unzip the `my-project-bridge` folder. Cloning the
   repository gives the same files plus the git history. The best place is **inside the folder that holds your
   projects** (for example `C:\Users\you\projects\my-project-bridge`): on its first start the Bridge lists the folders
   next to it. Windows' **Extract All** adds a folder named after the zip around it; a folder holding only the Bridge
   is passed over, and the folder above it is listed. Unzipped into Downloads, Desktop or Documents, it starts with an empty list and offers **Add a
   working folder**. Unzipped into any other folder, it lists the folders next to it: if those are not your
   projects, open **Folders**, remove that working folder and add yours.
2. Double-click **`install.cmd`**. If Windows says "Windows protected your PC", choose **More info › Run anyway**
   (or, before unzipping, right-click the zip › **Properties** › tick **Unblock**). It checks Node.js (and offers to
   install it), asks whether you want a desktop shortcut and to start the Bridge when you sign in to Windows
   (Enter = yes), sets up the Load Bridge link, then starts the Bridge. It opens in its own window. A small console
   window titled "My Project Bridge" starts minimised: that is the Bridge itself.
3. Changed your mind? **About > Run setup again** changes any of the three, and **About > Uninstall** (or
   `uninstall.cmd`) takes them all away. Neither deletes your files.

Already have Node.js? Double-clicking **`start-bridge.cmd`** works too: on its first start the **Welcome** window
offers the same shortcut and Start with Windows.

From then on, open it from the desktop icon, from **`index.html`** (click **Load Bridge**), or at
<http://127.0.0.1:8484/> while it runs.

**Stop it:** About > **Quit**, or close the minimised console window. Either one stops the Bridge and every local
copy it started. From a command line: `node server.js --stop`, and `node server.js --status` (exit code 0 = running).

## Your first five minutes

1. **Projects** lists the folders it found. Each one shows when it last changed, its tokens and its git state.
2. Click **Run local copy** on a project. The Bridge starts the project's own dev server and opens it in your
   browser. A project needs a start command for this; see [Where start commands come from](#where-start-commands-come-from).
3. Open **… › Scan app** to audit a project. Critical and High findings are the ones to fix first.
4. Open **… › Hosted live…** to add the address where a project is published. A light beside its name then shows
   whether the live site is up.
5. Click the **Git** count at the bottom to see which projects have work that is not saved or not backed up.

To try it first with made-up projects, double-click `start-demo.cmd` (see [Demo](#demo)).

## The window

### Left panel

- **My Project Bridge** at the top, with the **connection light**: ● Connected, or Connection lost in red. Click it to go
  home: the Projects page, scrolled to the top.
- **Projects**, **Folders**, **Audits**, **Prompts**: the pages. **Help** and **About** sit at the bottom.
- **This PC**: rings for CPU, memory, disk and GPU, then uptime, memory and disk in GB, and tokens this month and in
  total (with **Recount**). **GPU** is the figure Task Manager shows under Performance › GPU: the busiest part of the
  graphics chip (3D, video decoding, and so on), read from the same Windows counters. It needs no setup.
- **Running**: every site that is up. ● = started by the Bridge, ◐ = another program holds that project's port.
  Click a name to open it; the square stops it.
- **Live sites**: every project with a live address, its light (● up, ▲ unsure, ✕ down) and how long its page took
  to answer, worst first, with **Check now** and **Check every** (5, 10 or 15 minutes). Click one to see why.

### Along the bottom

- How many projects are on the list, how many are running (● 2 running, or ○ none running), and when the tokens were
  last counted (or "Counting tokens…", or a failed count with the way out: Recount in the This PC panel).
- **Git:** how many projects are backed up, waiting for a save or push, only on this PC, or not in git. Click it for
  the list of projects waiting, each with its git window. Hidden when no project uses git.

### Across the top

- **Orbit view** (the Orbital theme, which is the default): each running site floats over the Earth as a satellite,
  showing a picture of its own page and its own icon. **↗** on a satellite opens it in your browser. Clicking a
  satellite **stops that site**, with a short space-battle animation (it is "shot down"). A site held by another
  program (amber) is stopped the same way: stopping it ends that program. A newly started site launches up from the
  horizon. Prefer a plain look? Pick **Windows**, **Light** or **Dark** under **About › Theme**.

### Projects page

The command bar has **Add project**, **Scan folders** (says what is new or gone since the last scan), **Refresh**,
**List / Tiles**, the sort order (Last updated, **My order**, Most tokens, Name, Running first), **Stop all**,
**Show hidden** and search.

Each project shows its name, one sentence about it, tokens used, when it was last updated, its state, its last
audit and where it stands with **git** (click it for the details), with:

- **Copy prompt**: copies `Project: <name>` and `Full folder: <path>`, to paste into an AI coding tool that works on
  the files on your PC (Claude Code or Codex, say), so it starts in the right folder. It opens nothing. (A chat
  website cannot open a folder on your PC.)
- **Run local copy**: asks **Scan app / Skip**, checks the port is free, starts the project's own start command,
  waits for it to answer, then opens your browser. While it runs: **Open** and **Stop**.
- **…** menu: Scan app (audit), Last audit, **Hosted live…**, Open folder, Open terminal here, Move to top / up / down / bottom (or drag,
  while sorted by My order), Hide from display / Unhide, Remove from list.

### Hosted live

**… › Hosted live…** takes the address the project is hosted at (`example.com` is enough). The Bridge then asks for
that page once when it starts and then every 5, 10 or 15 minutes, as chosen under **Check every** in the Live sites
panel (15 to start with; one site at a time, two addresses on one domain 10 s apart), and shows a light beside the
project's name, and in the Live sites panel how long the page took to answer:

- **● Live** (green): the page answered normally over https.
- **▲ Live?** (amber, unsure): it answered, but something needs a look: a firewall or security-check page (your own
  PC may be blocked by the host), a default server page, a password prompt, plain http, a move to another domain, a
  certificate that expires within 14 days, a slow answer, or an answer only on the second try.
- **✕ Down** (red): no answer (asked twice), the name does not resolve, a server error (5xx), a 404 home page, an
  expired or wrong certificate, a redirect loop, or an "account suspended" / parked-domain page.

A site that goes down shows a red message once (it stays until you close it) and turns its light red. That message is
only in the Bridge's window: the Bridge does not send emails or phone alerts, so a site that must not go down unnoticed
needs a monitoring service of its own. If every site fails before any
answer, the Bridge says this PC is probably offline instead. An address on this PC or your home network is refused
(that is what Run local copy is for). The addresses are kept in the Bridge's own `data\settings.json`.

**States:** ● running · ◐ port in use (another program holds it) · ○ stopped · – no start command.

**Hide or Remove:** Hide keeps a project on the list but out of view (**Show hidden** brings it back). Remove takes it
off the list (**Folders > Removed from the list** brings it back). Neither one touches the project's files.

**Stop all** stops everything the Bridge started. A tick adds the other programs holding your projects' ports; each is
listed first with its program name, process number and command line. Windows' own programs, the Bridge and its
window are never stopped.

### Git

Each project carries a git mark, read only (the Bridge never commits, pushes or changes a folder):

| Mark | Means |
|---|---|
| ○ No git | not in git: no saved history and no backup copy |
| ▲ Only on this PC | saved in git, but with no copy anywhere else |
| ▲ Not pushed | linked to a copy (GitHub, say), but this PC has no record of a push |
| ▲ 2 not pushed / ▲ 3 unsaved | saves not pushed yet / changed files not saved yet |
| ● Backed up | everything saved is on the linked copy |

"Pushed" is as of this PC's last push or fetch: nothing is asked of GitHub.
Git must be installed (it usually is with GitHub Desktop's command-line option, or from git-scm.com).

The **Git** count in the bar at the bottom adds up the projects waiting for a save, a push or a backup copy; it opens a list,
and each project's git window gives the commands to copy into a terminal. The Bridge itself never runs them.

**See what changed** (in a project's git window, when files have changed) lists every file changed since the last save
(commit): changed, new, deleted or renamed, with lines added and removed, and the lines themselves, green for new and
red for gone. Read it before you commit, to see what an AI changed. New files not yet in git are shown from the folder;
binary files and very big changes are named, not shown. Read only: it saves, undoes and changes nothing.

### Folders, Audits, Prompts, Help, About

- **Folders:** your working folders (every folder inside one is a project), projects added one by one, and projects
  removed from the list. **Add working folder** opens the Windows folder picker.
- **Audits:** the latest audit of each project, and **Private details…**: the details about you (email, phone, street,
  full name) the audit looks for in what you would publish. A detail is typed once and never shown again: it stays in
  the Bridge's `data` folder, and the page and the audit show only its label.
- **Prompts:** prompts you use again and again, as a tile per category. Click a tile to see its prompts, then
  **Copy** / **Edit** / **Remove**; **Edit** can move a prompt to another category. **New category**, **Add prompt**,
  and inside a category **Rename category** and **Delete category** (it deletes the prompts in it, and says how many
  first). Search looks across every category, or inside the one open. A new Bridge starts with nine categories of five
  prompts each (SEO, writing, programming, marketing, business, teaching, research, UX design, photography); words in
  [brackets] are yours to fill in. Prompts saved before categories go into **My prompts**. Kept in `data\prompts.json` on this PC; the Bridge never sends or runs them.
- **Help:** how the Bridge works, what each git mark means and what to do about it, what leaves this PC, and what to
  do when something goes wrong.
- **About:** version, **Theme** (Orbital, Windows, Light, Dark), **Desktop shortcut** (Add, **Show me**, **Make a
  new one**, Remove), **Start with Windows**, **Setup** (Node.js version and **Run setup again**), **Git** (your Git
  version, a warning when it is older than the last security fix this Bridge knows about, and **Check online for a
  newer Git**, off until you tick it), **Quit** and **Uninstall**.

**Connection lost:** if the Bridge stops while its window is open, a red bar and a **Restart Bridge** item appear.
**Re-establish connection** starts it again (Edge may ask to open My Project Bridge: choose Open), and the page reloads
itself once the Bridge answers.

## Demo

Double-click **`start-demo.cmd`** to try the Bridge with made-up projects, without touching your own: nine fictional
projects, each with a real little website on your PC, three of them already in orbit, and six with made-up live addresses (served on your PC too) so the lights show
green, amber and red; one bakery's "live" copy has been tampered with, so its audit shows the live-vs-local check. It runs on
<http://127.0.0.1:8486/> with its own data (`data-demo`), shows the PC as DEMO-PC and paths as `C:\Users\demo\...`,
and only pretends to change shortcuts, so it is safe for screenshots.

Press **▶ Play demo** above the orbit for the tour: a site launches into orbit, another opens in your browser, and
**▶ Shoot it down** finishes with the faulty one (the audit flags it) raising its shields, firing back and exploding.
About > Quit stops the demo and its sites; every name and number in it is made up.

## Where start commands come from

The Bridge only runs commands stored in files. The page sends a project id and a command number, never command
text. It looks, in order, at:

1. the project's own `.claude/launch.json`;
2. the project's own `project.json`, key `start`;
3. the working folder's `.claude/launch.json`: entries whose arguments point inside the project;
4. the Bridge's own `projects.json`, key `start`.

A start command needs a `port`, so the Bridge can check the port is free and open the right address.

## Names and descriptions: `projects.json`

The Bridge **never writes into a project's folder**. Names, descriptions, live addresses, extra start commands and
audit settings live in the Bridge's own `projects.json` (next to `server.js`), keyed by folder name. The release zip
comes with an empty one; in a cloned copy, copy **`projects.example.json`** to `projects.json` first. Then edit it:

```json
{
  "projects": {
    "my-site": { "name": "My Site", "description": "Booking pages for the shop.", "liveUrl": "https://example.com",
                 "start": { "name": "dev", "exe": "node", "args": ["server.js"], "port": 3000 },
                 "auditSkip": ["old-copy"], "hide": false }
  }
}
```

`projects.json` is git-ignored, so your own list of project names never ends up in a repository. A folder with no
entry shows its folder name and the first sentence of its README.

## The built-in audit

A simple check on purpose: it catches common core faults, not everything. **Critical or High = fix first;
Medium = a warning; Low and Info = true but rarely harmful** (accessibility polish, search-engine details, working
notes, a test file that checks nothing): they sit folded at the bottom of the audit and never change its verdict.
Each rule keeps a **record** from the places people set aside as not a fault, across all your projects: a rule set
aside in 3 or more files, and more often than it still stands, shows "check this one" beside its findings, and the
audit lists the record of every rule it shows that someone has judged.

- **Code (about 130 rules):** private and API keys (placeholders and made-up keys are told apart), and a key or
  password taken out of the files that an older version in the **git history** still holds (SEC-012: Critical once
  pushed, since anyone with a copy has it; High while it is only on this PC; the key itself is never shown), service keys,
  passwords in code, hosting passwords saved by an editor, request data in SQL (PHP, Node, Python), in
  eval/include/system/shell commands, in unserialize or pickle, choosing a file to read or a place to redirect to;
  outside data going into the page as HTML or run as code; unescaped echo; weak password hashes, `==` on tokens,
  guessable random tokens, unsigned sign-in tokens, a visitor address taken from a header the visitor can write;
  POST forms with no token; uploads with no type check; CORS that trusts any site; certificate checks switched off;
  errors or a debug console shown to visitors; servers bound to 0.0.0.0; phpinfo pages; trackers printed before
  consent; a privacy page that does not name the outside services the site loads from; and `.env`, database dumps,
  backups, archives, logs, package lists, `.git` or an old copy of the site inside a web root (an archive a page
  links to is a download, so it is noted, not counted).
  Also (`lib/rules-more.js`): uploads (an image decoded before its pixel count is checked, a photo kept with its GPS
  details, a cut-off JPEG accepted, a zip or gzip unpacked with no limit, an upload too big reported as "choose a
  file", an upload checked after it is moved, a request body read with no cap); a GET that signs out or changes data;
  sign-in gaps (wrong tries counted per email, a limit keyed on the full IPv6 address or on CF-Connecting-IP from
  anyone, a password changed without the current one or leaving other devices signed in, secrets compared with ==,
  a sign-in state that is optional, a provider's email trusted unverified, a reset form that tells whether an email
  has an account, a check skipped when its secret is empty, a token from the address kept in browser storage,
  SameSite=None with no Origin check, CORS for every subdomain); payments (a capture marked paid without its status,
  a balance read then spent in a second query, a webhook answering 200 to a bad signature, Stripe livemode);
  JSON from a request used unchecked, a typed price cut to whole numbers, rows paged in code, a quantity with no
  ceiling, a CSV export that runs formulas, text cut mid-character, the UTC date used as today, PDF images squashed
  and Latin-1 PDF fonts; keepalive saves too big to send, data files with no ETag, a 429 with no Retry-After, a
  typed address fetched after only filter_var, a build that writes over an existing release zip; JSON printed into a
  script unescaped, a typed link printed as an href, typed text in a regular expression, a log line, a mail header
  or a Host-header link, postMessage to "*", exception text sent to visitors, a command-line tool in the web folder,
  a fixed temp file name, a CDN script with no integrity check; .htaccess rewrites that drop the https redirect,
  php_flag without IfModule, a dot-file rule that blocks /.well-known/; success shown without checking the reply, a
  fixed "Something went wrong", mail() not checked, an empty catch round a save, stored settings parsed outside try,
  delete with no confirm, a Back button that is history.back(), a service worker cache that never changes, checkboxes
  sharing a name without [], a component used without its import; working notes in shipped comments (review ids,
  commits and dates); text under 12px, pop-ups with no role="dialog" and labels not tied to their field.
  Across files (`lib/cross.js`, the project read as a whole): a public form that saves or mails with no per-visitor
  limit or no cap for everyone, a public call to a paid outside service with no cache and no cap; a table that
  requests keep adding to and the clean-up job leaves out; a public link that answers with the whole row; a webhook
  that ignores its handler's failure and answers 200; a release build that copies a whole folder holding notes or an
  installer, or leaves out a file its page links to; a page promising deletion after a time with nothing in the code
  deleting by age; the privacy page against the code (a picture host built in a script, "nothing kept on your
  device" with browser storage in use, a service named that the site no longer loads, outside loads with no privacy
  page at all); one place saving a record without the validator the others run; a row changed or deleted by its
  number alone; an action switch whose admin actions any signed-in person can run; the same price with two values in
  two files; a field the save step does not clean printed raw; deleting a record that leaves its uploads or its baked
  page behind; "forget everything" leaving keys behind; an /api/ address the page calls with no route on the server;
  a feature switched off only in the page's settings; install notes promising an older PHP or Node than the code
  needs; backups or logs written into the web folder with no deny rule for them; a Content-Security-Policy that
  blocks the site's own form or script; long-cached scripts and styles linked with no version; a test file that
  checks nothing.
- The same fault in several release copies of a file is reported once, with the other copies listed.
- **Localhost (only while the copy runs, only localhost addresses):** security headers, session cookie flags, folder
  listing, and whether files like `/.env`, `/.git`, editor FTP settings, `/error_log` or `/backup.zip` can be
  downloaded. A file the local dev server hands out but the project's `.htaccess` blocks on a real server is noted,
  not counted.
- **Live (only with a live address):** the live site's headers (checked there instead of on localhost, since a local
  dev server leaves out what the real server adds; a CSP that limits no scripts counts), https redirects (also for an
  admin folder with its own `.htaccess`), certificate expiry, and whether `/.env`, `/.git/HEAD`, `/error_log`,
  `package.json`, `composer.json` or an old copy at `/old/` can be fetched. Also: the home page's own stylesheet,
  scripts and an API address they call answering without the security headers the page has; a library version with
  known holes in a served script's banner (axios, jQuery, lodash, Moment.js, Bootstrap); a folder listing on the
  folders those files sit in; a made-up address answering 200 (soft 404); no meta description; a canonical address
  that does not answer; robots.txt hiding a page the sitemap asks to index; a sitemap page the project no longer has
  but the host still serves; and no DMARC record on the domain (a DNS lookup). These add about ten paced requests.
- **Live vs local:** the live home page and up to three pages it links to are compared with the same pages of the
  running local copy (or, when it is not running, with the project's files). Anything outside the site that the
  **live** page loads or links to, which the local page does not have and no project file names, is reported: an
  outside script, frame or form target (**High**), a hidden link (**High**, the mark of SEO spam), an inline script
  written to hide what it does (**High**), a script file that differs from yours and reaches a new address (**High**),
  or a visible link or picture (Medium: content you added on the live site explains it). A setting printed only on
  the live site (an analytics tag your code adds there) is named in your files, so it is noted, not counted.
  Live pages are asked **one every 5 seconds** and the compare stops at the first firewall or "too many requests"
  answer, because a burst of requests can get your own address blocked by the host.
- **What publishing would give away about you (the disclosure pass):** your private details (a list you fill in
  under **Audits › Private details**, plus what the Bridge reads from this PC each time: your user name, PC name,
  home folder, git name and email, and your projects folder), the **names of your other projects** (not inside a
  link, and a name that is an ordinary word only when written as a path to it, such as `../notes/`), an **AI or
  prompt trail** (AI tool folders and settings such as `.claude/` or `CLAUDE.md`, handover notes, prompt and revert
  notes, AI sign-offs, thread ids, chat links, "start here" markers naming a note, page copy saying an AI wrote it,
  and a person quoted by name and date; wording credited to "his" or "the owner's" rule counts only inside a
  comment, so a story or a help page stays quiet) and **local paths** that name a user (`C:\Users\<name>\…`). Your
  git name inside a link (`github.com/<name>/<repo>`) is allowed on purpose: it is the public address you publish
  at. It reads what would be
  published: the files git tracks, the files git would add (marked "not in git yet"), every past version of every
  file on every branch, commit messages, the email on every commit (marked already on the remote, not pushed yet,
  or only on this PC), the newest zip in each folder with the zips inside it, an older zip that a file in the
  project links to, and zips that only the git history still holds. Each finding names the first few lines that
  hold the same kind of detail, so fixing one does not hide the rest. Ignored files are not read; a
  folder with no git is read through its `.gitignore`. A private detail or a commit email that is not a noreply
  address is **High** wherever it is. Another project's name, an AI trail or a local path is Medium in what visitors
  are served (pages, scripts, a web folder, a release zip), Low in a file that only lives in the repository (notes,
  tests, tools, docs) and Info when only the git history or a commit message still holds it. **A finding shows the label, never the detail**, so the report is safe
  to paste into an AI. `node tools/disclose.js <folder>` runs the same pass from the command line.
  A handover or other AI working-notes file is one finding (the fix is to keep the file out), naming what its lines
  hold and High when one holds a private detail; the same line in the file, its history and the zips that ship it is
  one finding with the other places listed.
  It also reads file and folder names and zip entry names (a detail in a name is printed as its label), Word, Excel
  and PowerPoint files, UTF-16 text, details written encoded (`%40`, `&#64;`, `@` for @) and minified files up
  to 16 MB (long lines in slices). What it cannot read (PDFs, databases, `.tar.gz`, files over 16 MB) is named in a
  note, never passed over silently. Zips are unpacked up to 300 MB / 20,000 entries per scan (50,000 listed), so a "zip bomb" stops
  with a note instead of freezing the Bridge.
- The code rules leave out `node_modules`, `.git`, `vendor`, build and release copies, and test folders.
- **Old copies of the app** inside a project folder are left out too, so a fault is counted once, where the app
  lives: an `original ...` folder, a `...-fixes` copy, `old/` or `backups/`, an unpacked release (a `name-v1.2.3/`
  beside `name-v1.2.3.zip`, or a version folder inside `releases/`), older versions side by side (the highest
  stays), and copies like `my-app/` beside `my-app-php/` in a folder with nothing of its own (the one
  `.claude/launch.json` starts is the app, else the one changed last). The notes name every folder left out and
  why. The private-detail pass still reads a left-out copy that git would publish. To scan one anyway:
  `"auditInclude": ["old"]` in the project's `project.json` (or its entry in the Bridge's `projects.json`).
- **Not a fault…** beside a finding sets that one place aside, with your reason and who checked it. It is kept in
  `data\judged.json` and matched by the line's text: **edit the line and the finding comes back**. The set-aside list
  sits at the bottom of the audit, each with **Bring back**. A judgement must name one place: one for a whole project
  or a whole file is refused, so it can never switch a rule off.
- **Import report-back…** reads a "False flags" table (| Rule | Where | Verdict | Why | What the rule should do |),
  pasted or opened from a file. `false` sets that place aside; `duplicate of <id>` keeps the finding and tags it with
  the id it is already known as; anything else is left alone, and each row that could not be used says why.
- Older set-asides written by hand as `auditAccept` in the Bridge's `projects.json` still work. A project's own
  `project.json` cannot set its findings aside (a download could hide its own faults); if it asks to leave folders out
  (`auditSkip`), the audit names them in its notes.
- **Copy faults** puts the list on the clipboard to paste into the AI you use.
- **Review with AI…** builds a review prompt for the project, for the faults no rule finds (money, grants, what the
  pages promise, who may do what, PDFs, error messages, capacity, time windows, releases): a 13-point checklist, the
  files to read first (money, sign-in and roles, forms, privacy and terms, uploads and exports, release), what the
  scanner already reports and what was set aside. The project is named by its folder only and private details are
  replaced by their labels. Copy it into any AI (the Bridge opens none and sends nothing). The AI answers with a
  **Findings** table (Id | Severity | Category | Where | Evidence | Fix) and a **False flags** table; paste the answer
  into **Import report-back…**. Each finding must name one place (file:line); it goes on the project's fault list in
  `data\faults\` (open, fixed or not a fault, with who and when; a finding imported again keeps its status).

## Safety and privacy

- The Bridge listens on **127.0.0.1 only**, refuses any other host name, and every request must carry a key that
  changes each run, so other websites cannot use it.
- **Nothing about you or your projects is sent anywhere.** The window loads nothing from outside the Bridge, and the
  Bridge never sends your code or files to an AI or to any service. The requests the Bridge itself makes off your PC:
  - plain page requests (GET, no cookies, no sign-in) to the live addresses you add under Hosted live: one per site
    when the Bridge starts and then every 5, 10 or 15 minutes (your choice);
  - when you scan a project that has a live address: about ten more for the live checks, one DNS lookup (for the
    domain's DMARC mail record), and for the live-vs-local compare up to four pages and the scripts they load, paced
    5 seconds apart;
  - only if you tick **About > Git > Check online for a newer Git**: one request a day to GitHub for the newest Git
    for Windows version (off until you tick it).
- **A shared PC:** the Bridge is meant for a PC with one Windows user. Another program, or another Windows account
  on the same PC, can open <http://127.0.0.1:8484/> while it runs and use it as you can (including starting a
  project's start command), so do not run it on a PC you share with people you do not trust. A web page you visit can
  tell that the Bridge is running (it can load the Bridge's icon), but it cannot read or change anything.
- **Tokens** are counted from the Claude Code transcripts (`%USERPROFILE%\.claude\projects`) and Codex sessions
  (`%USERPROFILE%\.codex\sessions`) already on your PC. They are read, never changed or sent.
- **GPU use** is read on this PC only, from Windows' own counters.
- **Site pictures** for the Orbit view are taken by a hidden Edge window with its own empty profile (in
  `data\snaps\profile`), so it never sees your Edge sign-ins. It only opens your project's own local address.
  The site itself may load its own fonts or scripts, exactly as when you open it yourself.
- Everything the Bridge keeps is in its own `data` folder: settings (your folder paths), audit results, start logs,
  site pictures and your private-details list (`private-details.json`; the window only ever gets its labels back).
  Delete that folder to start fresh.
- The Load Bridge link (`my-project-bridge://start`) passes nothing from the web page to the Bridge; at most it starts it.
  Windows hands the link to Node.js, which starts the Bridge and reads nothing else.
  `uninstall.cmd` (or About > Uninstall) takes it away.

## If something goes wrong

- **"Node.js is not installed"** or **"needs Node.js 22 or newer"**: double-click `install.cmd`; it offers to
  install it. Or install the LTS version from <https://nodejs.org>, then start the Bridge again.
- **The window does not open**: open <http://127.0.0.1:8484/> in Edge, or run `node server.js --status`.
- **Port 8484 is taken by another program**: start it with `node server.js --port=8490` (or set `BRIDGE_PORT`), and
  open <http://127.0.0.1:8490/>. `index.html`, the desktop shortcut and the Load Bridge link only know port 8484.
- **A project shows "No start command"**: add a `start` for it in `projects.json` (see above).
- **No pictures in orbit**: they need Node.js 22 or newer and Microsoft Edge; a site that takes long to draw is
  pictured again after 15 seconds.
- **Your folders or prompts are suddenly back to the start**: the file that held them could not be read (cut short,
  or edited by hand). The Bridge kept it beside the new one in its `data` folder as `settings.damaged-<time>.json` or
  `prompts.damaged-<time>.json`. Quit the Bridge, mend the file or copy what you need back, and start it again.

## Questions

- **Does it send my code to an AI?** No. **Copy prompt**, **Copy faults** and **Review with AI…** only put text on
  your clipboard for you to paste into the AI you choose. The Bridge opens no AI and sends nothing.
- **Is the audit a full security test?** No. It catches common faults quickly; it is not a penetration test or a
  code review by a person. A clean audit means "no common faults found", not "safe".
- **Why do my projects show 0 tokens?** Tokens are counted only from Claude Code and Codex, from the files they
  already keep on your PC. Other AI tools are not counted.
- **Does it work on Mac or Linux?** Windows only for now. `node server.js` may start elsewhere, but opening a
  browser, a terminal or a folder, shortcuts, the folder picker and the Load Bridge link are "not available yet"
  there, and there are no site pictures. It has not been tested.
- **Does it change my projects?** No. It never writes into a project's folder and never runs git commands that
  change anything. It only starts the start commands stored in each project's own files when you click
  **Run local copy**.
- **How do I remove it?** `uninstall.cmd` (or **About > Uninstall**), then delete the `my-project-bridge` folder.

## Report a problem

Open an issue on this repository's **Issues** page: what you did, what you expected, and what happened, with the
version from **About**. Please leave out your own folder paths, project names and private details. Copy faults and
the audit show labels instead of your private details, but they do name the project and its files: read the text
before you paste it.

## What's new in 0.1.06

- A short README, with every detail moved to this user guide.
- The Bridge starts from a folder whose name holds `&`, from the shortcuts, Start with Windows and the Load Bridge
  link as well.
- Unzipped with Windows' Extract All, the first start lists your projects folder, not the folder named after the zip.
- Uninstalling one copy of the Bridge leaves another copy's desktop shortcut, Start with Windows and Load Bridge link
  alone, and says which it left.
- Run, Stop and Run again in quick succession starts the project once, and the second start is the one that counts.
- Open terminal here works for a folder with `;` in its name.
- Audits stay quick on unusual files (very long lines, pages full of tags or form fields, zips that list a great many
  files), and one scan reads at most 150 MB of code, with a note when it stops there.
- A place set aside as **Not a fault** no longer hides a later finding of the same rule in that file, and a
  private-detail finding comes back when another detail is added to the file.
- The judged list, the fault lists and the private-details list are saved whole or not at all; one that cannot be read
  is kept aside in the data folder, and the next audit says so.
- A project's own `project.json` that leaves folders out of the scan is named in full, and the check for private
  details still reads those folders.
- Import report-back stays quick on any text pasted in.
- A live address on this PC or your own network is refused when you add it, whatever way the address is written.
- The hidden browser that takes site pictures makes no background requests of its own.
- Picture capture reads at most what it keeps of a page or an icon.
- The demo's made-up sites answer a malformed address with an error instead of stopping.

## What's new in 0.1.05

- A local copy that ends by itself is reported at once, with its exit code, instead of after 20 seconds; Stop
  during a start takes effect at once; two clicks on Run local copy start it once.
- Saved prompts and imported tables keep every character whole (a character split between two network packets
  came through damaged).
- Adding a working folder during the start-up token count no longer leaves the new projects at 0 tokens; a Recount
  pressed during a count runs after it.
- Scan folders, Add working folder and Add project no longer hold the Bridge while the folders are read, so the page
  does not show Connection lost meanwhile.
- Quit while a site picture is being taken also closes the hidden browser taking it.
- Tokens this month follow this PC's calendar month, not UTC.
- Not a fault, Bring back and Import report-back refresh the project's audit chip and the Audits page at once.
- The Hosted live window shows Check now, Open live site and Remove address right after an address is added.
- Windows between 820 and 1150 pixels wide show each project on one column instead of squeezing the name out.
- A tick box is never the first thing a dialog focuses (Enter there would have submitted at once).
- The … menu gives the focus back to its button on Escape and closes when the focus leaves it; Move up and Move
  down swap with the neighbour you can see.
- `projects.json` keys match a folder in any letter case; a port given as `--port=abc` stops with the reason instead
  of leaving a Bridge running with nothing listening; a second Bridge started over the same data folder says where
  the first one is; a save refused for a moment by a virus scanner is tried again.
- The demo's Quit and Connection lost messages no longer offer the real Bridge's link.

## What's new in 0.1.04

- New name: **My Project Bridge**.
- The Load Bridge link is handled by Node.js, which only starts the Bridge.
- A project's git settings are read in every spelling git accepts before the Bridge decides whether to read its git
  state.
- A Windows script in a folder named with `&` now starts; a folder with `%` in its name is refused with the reason.
- After `install.cmd`, the Welcome window no longer asks the same two questions again.
- A README written for newcomers, and the developer notes in their own file.
