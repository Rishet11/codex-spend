# 💸 Codex-Spend

<p align="center">
  <img src="src/public/logo.png" width="120" height="120" alt="codex-spend logo">
</p>

<p align="center">
  <a href="https://startupslab.site" target="_blank" rel="noopener">
    <img src="https://cdn.startupslab.site/site-images/badge-dark.png" alt="Featured on Startups Lab" width="200" height="54" />
  </a>
</p>

**See where your OpenAI Codex tokens go. One command.**

`codex-spend` is a local dashboard for analyzing OpenAI Codex CLI usage. It parses your local Codex session/state data and visualizes token usage, estimated cost, and actionable patterns to help reduce spend.

---

## ✨ Features

- **⚡️ Instant Terminal Summary:** High-level breakdown of your recent sessions directly in your terminal on startup.
- **🛡️ Local & Private:** Your Codex usage data is read locally; the dashboard runs on `127.0.0.1` and nothing is uploaded.
- **📈 Usage Analytics:** Daily token usage charts, model breakdowns, cache hit rates, and token category splits.
- **💡 Actionable Insights:** Detects "One-Word Reply" traps, "Tab Hoarder" habits, context window overflows, reasoning ROI, and more.
- **📂 Project Breakdown:** See exactly which repositories or directories consume the most tokens.
- **💰 Accurate Cost Estimates:** Includes prompt caching discounts and reasoning tokens. Covers all current Codex models.
- **📋 Subscription Plan Mode:** If you pay a flat monthly fee instead of per-token, run with `--plan` to reframe costs as **API Equivalent Value** and see a rolling 3-hour and 7-day usage estimate.

## 🚀 Quick Start

Run it instantly without installation using `npx`:

```bash
npx codex-spend
```

### CLI Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--port <number>` | Change the local server port | `4321` |
| `--state-db <path>` | Override Codex state DB path (advanced) | auto-detect latest |
| `--no-open` | Skip automatic browser opening | |
| `--plan` | Subscription plan mode (shows API Equivalent Value + usage estimate) | |
| `--help` | Show usage instructions | |

### Subscription Plan Mode

If you use Codex via a ChatGPT Plus ($20/mo) or Pro ($200/mo) subscription instead of paying per token, add `--plan`:

```bash
npx codex-spend --plan
```

This will:
- Relabel "Est. Cost" → **"API Equivalent Value"** so you see the value you extracted, not a scary cost number
- Show your estimated token usage in the **last 3 hours** and **last 7 days** vs. your plan limits (160 msgs / 3hrs, 3,000 thinking msgs / week on Plus)
- Link directly to your official OpenAI usage analytics page

## 🛠️ How it Works

When you run `codex-spend`, the tool:
1. Locates your Codex CLI state (usually `~/.codex`).
2. Parses your `state_n.sqlite` database and `sessions/` transaction logs.
3. Automatically opens a local dashboard at `http://localhost:4321`.

### Requirements

- Node.js `>=18`
- `sqlite3` CLI installed on your system

  ```bash
  # macOS
  brew install sqlite

  # Ubuntu/Debian
  sudo apt-get install sqlite3
  ```

## 💰 Model Pricing Coverage

The dashboard uses official OpenAI API per-token pricing (verified July 2026):

| Model | Input / 1M | Cached Input / 1M | Output / 1M |
| :--- | :--- | :--- | :--- |
| `gpt-5.5` | $5.00 | $0.50 | $30.00 |
| `gpt-5.4` | $2.50 | $0.25 | $15.00 |
| `gpt-5.3-codex` | $1.75 | $0.175 | $14.00 |
| `gpt-5.2-codex` | $1.75 | $0.175 | $14.00 |
| `gpt-5.1-codex-max` | $1.25 | $0.125 | $10.00 |
| `gpt-5.2` | $1.75 | $0.175 | $14.00 |
| `gpt-5.4-mini` | $0.75 | $0.075 | $4.50 |
| `gpt-5.1-codex-mini` | $0.25 | $0.025 | $2.00 |

If a model is unknown, the dashboard warns that total cost may be underestimated.

## 🔐 Privacy

`codex-spend` is strictly a local analyzer.
- It **never** reads your API keys.
- It does **not** upload your Codex usage data anywhere.
- The source code is fully open for audit.

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 👨‍💻 Author

**Rishet Mehra**
- **GitHub:** [@Rishet11](https://github.com/Rishet11)
- **LinkedIn:** [Rishet Mehra](https://www.linkedin.com/in/rishetmehra/)
- **Email:** rishetmehra11@gmail.com
