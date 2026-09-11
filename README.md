# autowork

An interactive 3D operations studio with articulated, moving office characters
you can configure, assign, and run. Built with React 19,
react-three-fiber 9, three.js r186, drei 10, Zustand 5 and Tailwind CSS 4 on
Vite, with local and Netlify serverless model gateways.

The interface has invite-only Netlify Identity login, personal workspace setup,
free-form agent roles, individual and reviewed team assignments, switchable
office/neural-network views, recursive sub-agent hierarchies, approval-gated
learning, provider-native web research with citations, per-user persistence,
broad file support, softened
light/dark themes, and a Netlify-ready production configuration.

The office includes seated desk pods, ergonomic chairs, oak flooring, monitor UI,
desk accessories, a furnished bench lounge, a complete cafeteria/coffee area,
plants, and workspace-name architectural signage. Characters have independently
animated hips, knees, arms, and elbows. They sit at workstations, walk for coffee
when idle, walk to the cafeteria on a break, and physically travel to the Bench
before sitting on the front of its couch without intersecting the cushions. Idle
coffee trips are staggered and never occur more frequently than once every 30
minutes per agent. Motion can be paused and uses actual travel distance to drive
the walking cycle.

The floorplan also includes a dynamically-sized meeting wing (one room per
active team plus two flex rooms) and a separate management wing. Team leads and
agents with direct reports move into dedicated, well-spaced cubicles. Team
planning brings the involved agents into the team's temporarily named meeting
room, and completed contributions travel through manager cubicles for review.
Click a pod, cubicle, or meeting room to focus it; left-drag pans freely,
right-drag orbits, and the room expands as teams and manager rows are added.

## Install on Windows

**1. Install Node.js 22 LTS.** In PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell, then check you have 22.12 or newer:

```powershell
node -v
```

**2. Unzip the project** somewhere without spaces or OneDrive sync in the path
(`C:\dev\autowork` is a good choice), then `cd` into it.

**3. If npm refuses to run**, PowerShell is blocking scripts. This is the most
common Windows snag and it is safe to fix for your own user only:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**4. Install dependencies:**

```powershell
npm install
```

**5. Create your .env:**

```powershell
Copy-Item .env.example .env
notepad .env
```

Paste your key(s) after the `=`, with no quotes and no spaces, and save:

```
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

You only need the provider(s) you actually intend to use. Get them from
`platform.openai.com/api-keys` and `console.anthropic.com/settings/keys`.

**6. Start it:**

```powershell
npm run dev
```

That runs two processes: Vite on `http://localhost:5173` (open this) and the API
proxy on `http://localhost:8787`. Open an agent, scroll the panel to **Test
run**, and send a prompt to confirm the key works.

`.env` is read only at startup, so **restart after editing it**. If port 8787 is
taken, change `PORT` in `.env` — Vite reads the same value.

## Where the API key lives, and why

The key is held by `server/index.mjs`, a small zero-dependency Node proxy, and
the browser never sees it. The frontend only knows about `/api`.

This is not incidental. **Do not put the key in a `VITE_` variable.** Vite
string-substitutes those at build time, so the key ends up in plain text inside
the JavaScript bundle — readable by anyone who opens the page or the network
tab. The same applies to any "just call the API from the browser" approach: it
would need `dangerouslyAllowBrowser`, and the name is accurate.

Because nothing secret reaches the client, the built frontend is safe to host
with the included Netlify Function. Agent configuration and uploaded text/code
files are persisted in the browser; attached content crosses the network only
when that task is run.

Adding a provider means one entry in the `PROVIDERS` map in `server/index.mjs`
plus one in `src/data/llm-catalog.ts`.

Hosted model requests are budgeted at 52 seconds inside Netlify's current
60-second synchronous function limit. The remaining margin lets authentication,
request parsing and error serialisation finish before Netlify replaces the
response with a bare gateway 504. `MODEL_TIMEOUT_MS` may shorten this budget,
but values above 52,000 ms are capped.

If a request times out, the browser automatically retries that workflow step
using the same provider's fast model at low effort. The assignment, selected
files, output format and approval flow are preserved; the user does not need to
change the agent configuration manually.

Team assignments are most likely to press against this limit, because the team
lead's planning and review calls are the largest and highest-effort requests
the app makes. Each model call is its own HTTP request, so a long team
workflow never needs one request to cover the whole thing.

## Run it (any platform)

```bash
npm install
npm run dev        # Vite on :5173 + API proxy on :8787
npm run dev:web    # frontend only
npm run dev:api    # proxy only
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run test:netlify # serverless gateway contract
SINGLEFILE=1 npx vite build   # one self-contained dist/index.html
```

## Deploy to Netlify

The repository includes `netlify.toml` and `netlify/functions/api.mjs`. Follow
[NETLIFY_DEPLOYMENT.md](NETLIFY_DEPLOYMENT.md) for the Git import, environment
variables, access-code protection, deployment checks, and custom-domain setup.

## How the 3D and 2D layers meet

There is exactly one bridge between the `<Canvas>` and the DOM chrome: the
zustand store in `src/state/workspaceStore.ts`. Nothing is passed as props
across the boundary, so a click on a human office avatar and a click in the roster rail
take the same path.

```
App.tsx                     relative container
├── <OfficeCanvas/>         full-bleed WebGL
│   ├── Lighting            key + hemisphere + fills, PCSS soft shadows
│   ├── Office              room, team zones, desks, props
│   ├── OfficeAgent × N     clickable human avatars ── select(id) ──┐
│   └── CameraRig           eases orbit target to the selection    │
├── <TopBar/>                                                      │
├── <RosterRail/>           2D way into the same selection ────────┤
└── <AgentConfigOverlay/>   reads selectedId ◄─────────────────────┘
```

## Swapping in real .glb models

`src/three/Minifigure.tsx` exposes one agent-figure component with two implementations
behind the same props. Drop a file in `public/models/` and set `modelUrl` on the
agent:

```ts
updateAgent('a1', { modelUrl: '/models/minifig.glb' })
preloadAgentFigure('/models/agent.glb')   // optional, at module scope
```

Each agent renders its own `SkeletonUtils.clone()` of the cached glTF scene, and
any material whose name contains `torso` is recoloured from the agent's role.
Until the file loads (or if none is set) the procedural figure renders instead.

## Using it

**Account and workspace.** The first login asks for the owner's name and a
workspace name. The initials button opens an account menu instead of signing
out; the account page stores the owner, workspace name, login email, and contact
number. Each login remains isolated in that browser.

**Teams and agents.** The roster rail has *New agent* and *New team* at the
bottom. A new team gets a desk pod laid out on the floor automatically — the
floorplan, room size and camera framing are all computed from the current team
list (`src/data/layout.ts`), so nothing is hand-positioned. Deleting a team
moves its agents to the Bench rather than deleting them. Seats are positional:
an agent's spot is its index within its team, and pods create additional full
desk-and-chair rows as needed. Roles are not selected from a fixed list: enter a
role name and describe its responsibilities, then optionally make one member
the team's lead and final reviewer. Agents can report to any teammate, including
another sub-agent, producing an unlimited-depth hierarchy. Cycles are rejected;
moving a manager to another team carries its entire subtree, and every level
remains independently assignable.

**Assignments and running them.** Open *Assign* to choose an individual agent or
an entire team, write the brief, specify the exact output format, and attach
files. Individual work is returned directly. Team work is split fairly across
every member including the lead; contributions build on prior work, the lead
reviews the combined result, unsatisfactory junior work is returned for one
revision round, and the lead integrates the final client-ready output. Each
agent has Low, Medium, or High effort instead of temperature; higher effort
uses a larger token budget and provider reasoning effort where supported.
Every approved delivery is also published in its requested file type in the
shared workspace library, where any agent or team can attach it to later work.

**Approval and learning.** New drafts wait for the workspace owner by default.
Only an approved individual or team delivery becomes final, enters the shared
file library, and is added to the agents' bounded learning memory. That memory
is visible in each agent panel and is reused only for explicitly assigned work.
The *Skip my approval* option enables trusted auto-approval when desired.

**Files.** *Files* accepts any file up to 10 MB and stores it in browser
IndexedDB. Word, Excel, PowerPoint, OpenDocument and EPUB packages are converted
to model-readable text; PDFs and supported images retain their native content;
other binaries are retained and sent where the selected provider supports them.
Only files selected for an assignment cross the model gateway. Mentioning an
uploaded file by name selects it automatically; if the workspace contains one
file, phrases such as “the uploaded document” select that file as well.

**Outputs.** *Outputs* renders both individual results and lead-reviewed team
deliveries as polished documents with headings, lists, tables, code and source
links. Download controls create real PDF, Word, Excel, PowerPoint, HTML,
Markdown, JSON, CSV or text files based on the requested format. Approval saves
that artifact to the common workspace library. Failures remain visible with the
provider's exact error, and a timeout recovery records the model that actually
finished the step.

**Research.** Every agent receives a read-only provider web-search tool and may
use it when current information materially improves assigned work. Sources are
preserved as clickable citations. Research happens only during work the user
explicitly starts; external actions remain approval-controlled.

**Persistence.** Teams, agents, task lists, outputs, and workspace files are
browser-local, which works in both the static production bundle and local
development. The local server also keeps `data/state.json` as a best-effort
backup. Running tasks are saved as queued, so a refresh mid-run cannot leave a
task stuck forever.

## Tests

```bash
npm run test:mock       # fake model endpoint on :9911
npm run test:e2e        # files + individual work + team review + shutdown/resume + reload + account isolation
npm run test:scene      # 3D geometry: overlaps at 3-6 teams, seating, walking, camera resets
npm run test:contrast   # WCAG AA audit of every text node, both themes
npm run test:visual     # articulated joints, motion controls, camera visibility and responsive screenshots
```

`test:e2e` needs the dev server running, plus the API server pointed at the
mock so no key or network is required:

```bash
npm run test:mock
ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:9911/v1 npm run dev
npm run test:e2e
```

Both scripts need `playwright-core`; set `CHROME_PATH` to reuse a browser you
already have.

## Theming

There are no `dark:` variants in any component. Every 2D surface, text colour
and border uses a semantic token declared in `src/index.css` (`bg-surface`,
`text-ink`, `text-ink-faint`, `border-line`, `bg-solid`/`text-on-solid`, …), and
dark mode is one block of variable overrides under
`:root[data-app-theme="dark"]`. Contrast is therefore decided in a single place
instead of drifting component by component.

Data-driven chips (agent, team, provider, model tier) are generated from one hex
each by `src/theme/pill.ts`, using fixed mix ratios tuned so the worst hue in
the palette still clears WCAG AA for small text in both themes. Adding an agent
color does not require hand-checking contrast again.

`src/state/themeStore.ts` resolves the active theme as: explicit user choice →
host `data-theme` attribute → OS `prefers-color-scheme`. It writes
`data-app-theme` (never `data-theme`), so an embedding page's own theming and
this app's toggle can coexist. The 3D scene has its own matching palette in
`src/theme/palette.ts` — lighting intensities, floor and wall colours, and a mix
factor that pulls the pastel team tints toward the floor colour in dark so they
read as surfaces rather than glowing panels.

### Checking contrast

`audit.mjs` walks every text node in the rendered page, composites translucent
ancestors down to the canvas clear colour, and asserts the WCAG AA ratio for the
element's own font size and weight. Run it against a build in both themes before
changing any colour token.

## Changing the model catalog

`src/data/llm-catalog.ts` is the only file to edit. The provider dropdown is
built from it, the model dropdown is derived from the selected provider, and
`setProvider` repairs the model when it no longer belongs to the new provider.
