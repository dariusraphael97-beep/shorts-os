# Shorts OS — Manual Setup Checklist

**Do these BEFORE starting Plan #1 execution. No Claude needed for any of this.**

Total time: ~2 hours. You can break it up over multiple sittings — just check things off as you go.

Save every key/secret to a notes file or password manager as you go. You'll paste them all into `.env.local` later.

---

## 🛠️ STEP 0 — Tools on your MacBook (15 min)

- [ ] **0a. Install Node.js 24 LTS**
  - Go to https://nodejs.org/en/download
  - Pick the **LTS** macOS installer (`.pkg`)
  - Run it, click through defaults
  - Verify in Terminal:
    ```bash
    node --version
    ```
    Should print `v24.x.x` or higher.

- [ ] **0b. Confirm Git is installed**
  - In Terminal:
    ```bash
    git --version
    ```
    If it prints a version → done.
    If macOS prompts you to install Xcode Command Line Tools → click Install and wait ~5 min.

- [ ] **0c. Install Vercel CLI globally**
  - In Terminal:
    ```bash
    npm install -g vercel@latest
    vercel --version
    ```
    Should print `54.x.x` or higher.

✅ When this section is done, your MacBook is ready.

---

## 🤖 STEP 1 — Anthropic API key (10 min)

This is what powers Claude inside the tool.

- [ ] **1a.** Go to https://console.anthropic.com/
- [ ] **1b.** Sign in (use your existing Anthropic account if you have one, otherwise create one with your email)
- [ ] **1c.** Click your profile (top right) → **API Keys**
- [ ] **1d.** Click **Create Key**
- [ ] **1e.** Name it `shorts-os` → Create
- [ ] **1f.** **COPY THE KEY IMMEDIATELY** — it starts with `sk-ant-...`. You won't see it again after closing the dialog.
- [ ] **1g.** Save in your notes:
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  ```
- [ ] **1h.** Add $10 of credit to your Anthropic account (Settings → Billing → Add Credit). $10 is plenty for first 1–2 months at our usage level.

**Cost:** ~$20–50/month once tool is running.

---

## 🗄️ STEP 2 — Supabase project (15 min)

This is the database.

- [ ] **2a.** Go to https://supabase.com/dashboard
- [ ] **2b.** Sign in with GitHub (easiest) or email
- [ ] **2c.** Click **New Project**
- [ ] **2d.** Fill in:
  - **Name:** `shorts-os`
  - **Database Password:** click "Generate" and **save the generated password** to your notes. You'll need it once.
  - **Region:** pick `East US (North Virginia)` or `East US (Ohio)` (closest to NJ)
  - **Plan:** Free (don't upgrade — free tier is plenty)
- [ ] **2e.** Click **Create new project**. Wait ~2 minutes for it to provision.
- [ ] **2f.** Once ready, click **Project Settings** (gear icon) → **API**
- [ ] **2g.** Save these to notes:
  ```
  SUPABASE_URL=<copy "Project URL">
  SUPABASE_ANON_KEY=<copy "anon public" key>
  SUPABASE_SERVICE_ROLE_KEY=<copy "service_role" key — click "Reveal" first>
  ```
  ⚠️ The **service_role** key is sensitive (god-mode access). Never paste it in public/Discord/etc.
- [ ] **2h.** Find your project ref in the URL bar (`https://supabase.com/dashboard/project/XXXXXX`) — save the `XXXXXX` part:
  ```
  SUPABASE_PROJECT_REF=<the value after /project/>
  ```

**Cost:** Free (free tier handles us indefinitely at v1 scale).

---

## ☁️ STEP 3 — Vercel account + project (10 min)

This is where the tool lives on the internet.

- [ ] **3a.** Go to https://vercel.com/signup
- [ ] **3b.** Sign in with GitHub (recommended — easier deploys later)
- [ ] **3c.** From the dashboard, you don't need to create a project yet — we'll do that from the CLI during Plan #1 execution.
- [ ] **3d.** In Terminal, login to the CLI:
  ```bash
  vercel login
  ```
  Pick your sign-in method, follow the browser prompt.
- [ ] **3e.** Verify:
  ```bash
  vercel whoami
  ```
  Should print your username.

**Cost:** Free for v1 (Hobby plan). Possibly $20/mo (Pro) later if you exceed limits — not for months.

---

## 📺 STEP 4 — YouTube Data API key (20 min)

This lets us read YouTube Shorts data.

- [ ] **4a.** Go to https://console.cloud.google.com/
- [ ] **4b.** Sign in with the Google account you'll use for your YouTube channels
- [ ] **4c.** If prompted, accept terms of service
- [ ] **4d.** Top bar → click the project dropdown (might say "Select a project") → **New Project**
  - Name: `shorts-os`
  - Click **Create**
  - Wait ~30 sec for it to create, then select it from the dropdown
- [ ] **4e.** Left sidebar (or hamburger menu) → **APIs & Services** → **Library**
- [ ] **4f.** Search for `YouTube Data API v3` → click it → click **Enable**
- [ ] **4g.** Once enabled, click **Credentials** in left sidebar → **+ CREATE CREDENTIALS** → **API key**
- [ ] **4h.** Copy the key (starts with `AIza...`):
  ```
  YOUTUBE_API_KEY=AIza...
  ```
- [ ] **4i.** Optional but recommended: click **Edit API key** → under "API restrictions" pick "Restrict key" → check only **YouTube Data API v3** → Save. (Limits damage if key leaks.)

**Cost:** Free up to 10,000 units/day. Our usage is ~500/day, so plenty of headroom.

---

## 🟠 STEP 5 — Reddit Developer app (10 min)

This lets us read Reddit posts.

- [ ] **5a.** Go to https://www.reddit.com/prefs/apps
- [ ] **5b.** Scroll to bottom → **are you a developer? create an app...**
- [ ] **5c.** Fill in:
  - **Name:** `shorts-os`
  - **Type:** select **script** (the radio button)
  - **Description:** `Trending topic harvester` (or anything)
  - **About URL:** leave blank
  - **Redirect URI:** `http://localhost:3000` (required even though we don't use it for script-type apps)
- [ ] **5d.** Click **Create app**
- [ ] **5e.** Save to notes:
  ```
  REDDIT_CLIENT_ID=<the short string DIRECTLY UNDER the app name, looks like "AbCdEf123">
  REDDIT_CLIENT_SECRET=<the longer "secret" value>
  REDDIT_USER_AGENT=shorts-os/0.1 by /u/<your-reddit-username>
  ```
  ⚠️ The `client_id` is the small string under the app name (NOT labeled). The `secret` is the longer one labeled "secret". Easy to mix them up.

**Cost:** Free.

---

## 🎵 STEP 6 — TikAPI (10 min)

This lets us read TikTok trending data.

- [ ] **6a.** Go to https://tikapi.io/
- [ ] **6b.** Click **Get Started** / **Sign Up**
- [ ] **6c.** Create an account with your email
- [ ] **6d.** Pick the **Basic** plan ($30/mo). You'll need a credit card.
- [ ] **6e.** Once subscribed, go to **Dashboard** → **API Keys**
- [ ] **6f.** Save to notes:
  ```
  TIKAPI_KEY=<the long key string>
  ```

**Cost:** $30/mo, billed monthly. Cancel anytime if you decide to skip TikTok signal in v1.

> ⚠️ **You can skip Step 6 for now** and the tool will still work — you just won't have TikTok as a trend signal. If money is tight today, skip this and add it later. The spec assumes you have it, but our code already handles "TikAPI key missing → log and continue."

---

## 🎯 STEP 7 — Save it all in one file

Create a file on your MacBook called `shorts-os-secrets.txt` somewhere SAFE (Notes app is fine, or a password manager). It should look like:

```
# Shorts OS secrets — DO NOT commit to git, DO NOT share

ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_PROJECT_REF=xxxxx
SUPABASE_DB_PASSWORD=<from step 2d>
YOUTUBE_API_KEY=AIza...
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USER_AGENT=shorts-os/0.1 by /u/<your-username>
TIKAPI_KEY=<if you did Step 6>
```

You'll paste these into `.env.local` during Plan #1 Task 0.4.

---

## ✅ When everything is checked

Open a brand-new Claude Code session, `cd` into `~/Downloads/shorts-os/`, and paste this exact prompt:

```
I'm executing Plan #1 at docs/superpowers/plans/2026-05-24-shorts-os-phase-0-1-foundation.md.
Use the superpowers:subagent-driven-development skill to dispatch tasks one at a time.
I've completed all manual signups in SETUP_CHECKLIST.md and have all secrets saved.
Start with Task 0.1.
```

That's when the actual build begins. See you on the other side.

---

## ❓ If something goes wrong during signup

- **Anthropic asks for billing info before letting you create a key:** add $5 of credit, that unlocks key creation.
- **Supabase free tier seems "paused" later:** they pause projects with no activity for 7 days. Once we start hitting the DB it stays active.
- **Google Cloud asks for a billing account:** YouTube Data API v3 is free under the quota; you can enable billing without being charged. If you don't want to enter a card, you can skip and we'll set this up during Task 2.2 instead.
- **Reddit doesn't show the client_id clearly:** it's the gibberish string DIRECTLY BELOW the app name, NOT labeled. Hover/click to highlight.
- **TikAPI feels expensive:** SKIP IT for v1, add later. The tool gracefully degrades.

If you get stuck, snap a screenshot of where you're stuck and bring it to the next Claude session.
