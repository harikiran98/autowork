# autowork

An interactive 3D operations studio with articulated, moving office characters
you can configure, assign, and run. Built with React 19,
react-three-fiber 9, three.js r186, drei 10, Zustand 5 and Tailwind CSS 4 on
Vite, with local and Netlify serverless model gateways.

The interface has invite-only Netlify Identity login, status-specific character
motion, switchable office/neural-network views, responsive glass panels,
per-user browser-local workspace persistence, task queues, file attachments,
light/dark themes, and a Netlify-ready production configuration.

The office includes standing desks, ergonomic chairs, oak flooring, monitor UI,
desk accessories, a furnished lounge, plants, and autowork architectural signage.
Characters have independently animated hips, knees, arms, and elbows. Motion can
be paused, respects reduced-motion preferences, and uses actual travel distance
to drive the walking cycle. Select a teammate for a close-up; Office view resets
the camera. Both the compact mobile roster and desktop sidebar remain available.

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
across the boundary, so a click on a minifigure and a click in the roster rail
take the same path.

```
App.tsx                     relative container
├── <OfficeCanvas/>         full-bleed WebGL
│   ├── Lighting            key + hemisphere + fills, PCSS soft shadows
│   ├── Office              room, team zones, desks, props
│   ├── LegoAgent × N       clickable minifigures  ── select(id) ──┐
│   └── CameraRig           eases orbit target to the selection    │
├── <TopBar/>                                                      │
├── <RosterRail/>           2D way into the same selection ────────┤
└── <AgentConfigOverlay/>   reads selectedId ◄─────────────────────┘
```

## Swapping in real .glb models

`src/three/Minifigure.tsx` exposes one component with two implementations
behind the same props. Drop a file in `public/models/` and set `modelUrl` on the
agent:

```ts
updateAgent('a1', { modelUrl: '/models/minifig.glb' })
preloadMinifigure('/models/minifig.glb')   // optional, at module scope
```

Each agent renders its own `SkeletonUtils.clone()` of the cached glTF scene, and
any material whose name contains `torso` is recoloured from the agent's role.
Until the file loads (or if none is set) the procedural figure renders instead.

## Using it

**Teams and agents.** The roster rail has *New agent* and *New team* at the
bottom. A new team gets a desk pod laid out on the floor automatically — the
floorplan, room size and camera framing are all computed from the current team
list (`src/data/layout.ts`), so nothing is hand-positioned. Deleting a team
moves its agents to the Bench rather than deleting them. Seats are positional:
an agent's spot is its index within its team, and pods hold any number of
agents by queueing extra rows behind the desk.

**Tasks and running them.** Open an agent and use the Tasks section. Each task
is one independent model call using that agent's role charter, system prompt,
temperature and model — no conversation is carried between tasks. **Run** works
through the queue one task at a time (sequential, because parallel requests are
the fastest way to hit a rate limit) and stops at the first failure, since a
missing key or a bad model name would fail every remaining task identically.

**Files.** *Files* in the top bar opens the workspace. Drop in text and code
files; they are stored in this browser and persist across refreshes. Attach them
per task — only those selected files are sent through the model gateway when
the task runs.

**Outputs.** *Outputs* lists every finished task newest first, with the agent,
the task, the model, how long it took, and a copy button. Failures appear here
too, with the provider's own error message.

**Persistence.** Teams, agents, task lists, outputs, and workspace files are
browser-local, which works in both the static production bundle and local
development. The local server also keeps `data/state.json` as a best-effort
backup. Running tasks are saved as queued, so a refresh mid-run cannot leave a
task stuck forever.

## Tests

```bash
npm run test:mock       # fake model endpoint on :9911
npm run test:e2e        # full flow: create team -> agent -> task -> run -> outputs -> reload
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

Data-driven chips (role, team, provider, model tier) are generated from one hex
each by `src/theme/pill.ts`, using fixed mix ratios tuned so the worst hue in
the palette still clears WCAG AA for small text in both themes. Adding a role
does not require hand-checking contrast again.

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
