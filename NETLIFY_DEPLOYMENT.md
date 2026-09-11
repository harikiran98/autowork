# Deploy autowork to Netlify

This repository is ready for a Git-connected Netlify deployment. `netlify.toml`
defines the Vite build, `dist` publish directory, security headers, API rewrite,
and the serverless function directory.

The `autowork-netlify.zip` package contains the source and a prebuilt `dist`
folder. Unzip it and use the Git-connected deployment below for the complete
app. Uploading only `dist` with a static drag-and-drop deploy does not include
the model gateway functions.

## Before you deploy

Run the production checks locally:

```bash
npm ci
npm run build
npm run test:netlify
```

Do not commit `.env`. The browser bundle never needs or receives an API key.

## 1. Put the project in a Git repository

Create an empty GitHub/GitLab/Bitbucket repository, then from this folder run:

```bash
git add .
git commit -m "Prepare autowork for Netlify"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

If this folder already has the correct remote, omit the `git remote add` line.

## 2. Import it in Netlify

1. In Netlify, choose **Add new project → Import an existing project**.
2. Connect the Git provider and select the repository.
3. Netlify should read these settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Choose **Deploy**.

Future pushes to the production branch trigger new deploys automatically.

## 3. Add server-side secrets

In the Netlify project, open **Project configuration → Environment variables**.
Add at least one provider key:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

`WORKPLACE_ACCESS_CODE` is now optional because paid model calls also require a
verified Identity session. You can still add it as a second shared secret.
Mark API keys as **Contains secret values**. On plans that expose variable
scopes, **Functions** must be checked. If Netlify disables **All scopes** after
you mark a variable secret and shows Builds/Functions/Runtime under Specific
scopes, that is expected—leave those available scopes checked; no upgrade is
needed just to make the function read the key. Use **Same value for all deploy
contexts** unless you intentionally maintain separate keys.

Optional gateway overrides are `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL`.
After changing variables, trigger a fresh deploy.

### Function timeout — check this before blaming the app

Netlify's current synchronous function limit is **60 seconds**. The platform
terminates work at that boundary, so autowork keeps its own model deadline
below it; otherwise the browser receives a bare **504** instead of a useful
JSON response. Team assignments encounter this more often because planning and
review prompts are larger than short individual tasks.

The gateway budgets 52 seconds inside Netlify's 60-second synchronous function
limit, reserving time to return a useful error response. If a model still times
out, autowork automatically retries that step using the same provider's fast
model at low effort; the assignment, files and approval flow are preserved.

`MODEL_TIMEOUT_MS` can be used to shorten the internal budget, but values above
52,000 ms are capped so Netlify does not replace the response with a bare 504.

Never prefix a secret with `VITE_`; Vite variables are shipped to the browser.

## 4. Enable login and create users

1. In your Netlify project, open **Identity** and choose **Enable Identity**.
2. Open **Identity → Registration → Registration preferences**, choose
   **Invite only**, and save. This prevents strangers from making accounts.
3. Open **Identity → Users** and choose **Invite users**.
4. Enter your friend or family member's email address. Netlify sends their
   private invitation link automatically.
5. They open the link on your autowork domain, choose their password on the
   branded welcome page, and are signed in.

Repeat step 3 for each person. To remove access later, delete that person under
**Identity → Users**. The app also includes **Forgot password** and sign-out.
Invited people do not need a Netlify account.

Each account gets a separate workspace in that browser. This version does not
sync teams, tasks, or uploads between devices; sharing the site shares access to
the tool, not your private browser data.

## 5. Verify the deployment

Open the generated `https://YOUR-SITE.netlify.app` URL. Then check:

1. An incognito window shows the autowork login page, not the office.
2. Sign in using an invited account.
3. `/api/health` returns JSON with `"ok": true`.
4. The configured provider is `true` in the `providers` object.
5. Complete the workspace-name prompt, open **Assign**, add a small individual
   assignment, and run it.
6. Ask for a Word or PDF output, confirm the answer renders correctly, then use
   **Download** and approve it to add the real file to the shared library.
7. Refresh the page and confirm the workspace is restored.

Agent configuration and uploaded files are stored in that browser. They
are not shared across devices or users. Attached file contents are sent to the
configured AI provider only when a user explicitly runs that task.

## 6. Connect your domain

1. In the Netlify project, open **Domain management**.
2. Choose **Add a domain → Add a domain you already own**.
3. Enter the domain and choose one of the two paths:
   - **Netlify DNS:** follow the displayed name-server instructions at your registrar.
   - **External DNS:** keep your current DNS host and add the exact records shown
     under **Pending DNS verification**. This is typically a CNAME for `www` and
     an ALIAS/ANAME/flattened-CNAME or fallback A record for the apex domain.
4. Pick the primary domain and allow DNS propagation to complete. Netlify will
   provision HTTPS after the DNS records verify.

Use the records shown inside your own Netlify project rather than copying DNS
targets from an old tutorial; Netlify tailors them to the domain and network.

## Troubleshooting

- **The app loads but model tasks are disabled:** visit `/api/health`, confirm
  the provider key is present, then redeploy after editing environment variables.
- **401 / workspace locked:** enter the exact `WORKPLACE_ACCESS_CODE` in the
  selected agent panel. It is remembered only for the current browser tab.
- **404 under `/api`:** confirm `netlify.toml` is at the repository root and the
  deploy log shows the `api` function.
- **A model returns 400/404:** update its ID in `src/data/llm-catalog.ts`; model
  availability depends on the provider account.
- **Web research is rejected:** confirm web search is enabled for the provider
  account and that it has billing available. The key remains server-side.
- **Domain remains pending:** use Netlify's domain-specific DNS instructions and
  remove conflicting A, AAAA, or CNAME records at the same hostname.
