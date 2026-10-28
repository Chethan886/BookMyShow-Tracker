# 🎟️ BookMyShow Karwar Ticket Availability Tracker

A lightweight, 100% serverless automated ticket tracker for **BookMyShow Karwar** built with Node.js, Cheerio/Axios, and GitHub Actions. It monitors BookMyShow for movie ticket releases (specifically targeted for **"Ramayana"**) and sends instant, rich push notification alerts via Discord Webhook.

---

## 🌟 Key Features

- **Serverless & Zero-Cost:** Runs entirely on GitHub Actions cron workflows (every 15–20 minutes) with no external servers, VPS, or paid daemons.
- **Karwar Focused:** Monitors BookMyShow's Karwar region (`karwar`) including single-screen and multiplex venues like *Miraj Cinemas: Geetanjali, Karwar*.
- **Multi-Layer Scraper Architecture (`tracker.js`):**
  - **Layer 1 (Next.js SSR Hydration):** Extracts and deeply traverses the structured `__NEXT_DATA__` JSON payload embedded in BookMyShow pages.
  - **Layer 2 (Cheerio DOM Traversal):** Inspects HTML anchors, cards, and buttons for active booking cues (`/buytickets/`, "Book tickets", "Advance Booking").
  - **Layer 3 (Catalog API Fallback):** Queries BookMyShow's catalog/quickbook data feed for regional events.
- **Smart Anti-Bot Strategy:** Clean browser-like headers (`User-Agent`, `Accept`, `Sec-Ch-Ua`, `Referer`), regional cookie simulation, and exponential backoff retries.
- **Deduplication State (`state.json`):** Tracks notification history and commits state back to the repository so you receive an instant alert when bookings open, without getting spammed every 20 minutes thereafter.
- **Rich Discord Alerts:** Dispatches a mobile push-optimized Discord embed with the movie title, direct booking button, monitored theater names, and `@everyone` ping.
- **One-Click Test Mode:** Supports instant test alert dispatch (`npm run test-alert` or manual GitHub Actions trigger) to verify your webhook before release day.

---

## 📁 Repository Structure

```
├── .github/
│   └── workflows/
│       └── tracker.yml      # GitHub Actions cron + dispatch workflow
├── test/
│   └── tracker.test.js      # Unit tests for title matching, Next.js & DOM parsing
├── .env.example             # Template for local environment variables
├── .gitignore               # Ignores node_modules, temp files, and keeps state.json
├── package.json             # Minimal dependencies (axios, cheerio, dotenv)
├── state.json               # Lightweight alert state file (persisted across runs)
├── tracker.js               # Main scraper, detection, and alerting engine
└── README.md                # Setup guide and documentation
```

---

## 🚀 Step-by-Step Setup Instructions

### 1. Create a Discord Webhook

1. Open your Discord server and navigate to the channel where you want ticket alerts (e.g. `#movie-alerts`).
2. Click the channel **Settings (⚙️ Gear icon)** ➔ **Integrations** ➔ **Webhooks**.
3. Click **New Webhook**.
4. Name it `BookMyShow Tracker` and optionally upload a BookMyShow avatar.
5. Click **Copy Webhook URL**. Save this URL (it will look like `https://discord.com/api/webhooks/1234567890/abcdef...`).

---

### 2. Push Code to Your GitHub Repository

Initialize and push this directory to a private (or public) GitHub repository:

```bash
git init
git add .
git commit -m "feat: initial BookMyShow Karwar tracker setup"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

---

### 3. Add GitHub Repository Secret

1. In your GitHub repository, navigate to **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Click **New repository secret**.
3. Name: `DISCORD_WEBHOOK_URL`
4. Value: Paste your Discord webhook URL from Step 1.
5. Click **Add secret**.

*(Optional Variable)*: Under **Secrets and variables** ➔ **Actions** ➔ **Variables** tab, you can add `DISCORD_MENTION` (e.g., `@everyone`, `@here`, or a specific role mention like `<@&123456789>`). Defaults to `@everyone`.

---

### 4. Enable Workflow Write Permissions (Crucial for State Persistence)

To allow GitHub Actions to commit and push changes to `state.json` so you aren't spammed with duplicate alerts:

1. In your GitHub repository, go to **Settings** ➔ **Actions** ➔ **General**.
2. Scroll down to **Workflow permissions**.
3. Select **Read and write permissions**.
4. Click **Save**.

---

### 5. Run the Verification Test Workflow

Verify that your webhook and workflow are working:

1. In your GitHub repository, go to the **Actions** tab.
2. In the left sidebar, click **BookMyShow Karwar Ticket Tracker**.
3. Click the **Run workflow** dropdown on the right:
   - Check **"Send test Discord alert to verify webhook"** (`test_alert: true`).
   - Click **Run workflow**.
4. Within ~20 seconds, you will receive a test embed in your Discord channel confirming connectivity!

---

## 💻 Local Development & Testing

### Prerequisites
- Node.js 18+ installed

### Setup & Run

1. Clone or open the project directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```
4. Add your Discord Webhook URL inside `.env`:
   ```env
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```
5. Run the test suite:
   ```bash
   npm test
   ```
6. Send a live test alert to your Discord channel:
   ```bash
   npm run test-alert
   ```
7. Run the standard tracker check:
   ```bash
   npm start
   ```

---

## ⚙️ Configuration Reference

| Environment Variable | Default | Description |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | *(Required)* | The Discord webhook endpoint URL. |
| `DISCORD_MENTION` | `@everyone` | Mention flag for mobile push (`@everyone`, `@here`, or `none`). |
| `BMS_REGION` | `karwar` | BookMyShow region slug. |
| `TARGET_KEYWORDS` | `Ramayana,Ramayana: Part 1,Ramayana - Part 1` | Comma-separated list of movie keywords. |
| `FORCE_ALERT` | `false` | If `true`, ignores `state.json` and resends the alert if tickets are live. |
| `TEST_ALERT` | `false` | If `true`, dispatches a verification notification and exits. |
| `REQUEST_TIMEOUT_MS` | `15000` | HTTP request timeout per page in milliseconds. |
| `MAX_RETRIES` | `3` | Number of retry attempts on temporary HTTP/network glitches. |

---

## 📊 How State Persistence Works

1. During each cron run, `tracker.js` checks `state.json`.
2. When tickets for **Ramayana** are detected as live/bookable:
   - If `state.alertSent` is `false`:
     - Dispatches the rich Discord notification with `@everyone`.
     - Sets `alertSent: true` and records timestamp and booking link.
     - GitHub Actions commits `state.json` back to your repo using `[skip ci]`.
   - On subsequent runs:
     - Detects `alertSent === true`.
     - Skips sending duplicate webhooks to prevent channel spam.
3. If you want to reset the alert or re-arm the tracker, simply edit `state.json` and set `"alertSent": false`.

---

## 🛡️ Error Handling & Reliability

- **Soft Failures in Cron:** Third-party drops or temporary 503/403 responses are caught and handled gracefully without failing the GitHub Actions job, preventing annoying GitHub error emails.
- **Exponential Backoff:** If BookMyShow takes longer to respond, requests are retried with 2.5s, 3.8s, and 5.7s intervals.
- **Concurrent Run Protection:** The GitHub Actions workflow defines `concurrency: bms-tracker` so overlapping runs do not cause git push conflicts.
