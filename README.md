# 💸 codex-spend

**See where your OpenAI Codex tokens go. One command.**

`codex-spend` is a local dashboard for analyzing OpenAI Codex CLI usage. It parses your local Codex session/state data and visualizes token usage, estimated cost, and patterns that can help reduce spend.

![Codex Spend Dashboard Preview](https://github.com/user-attachments/assets/746d88ae-4f24-42f1-9457-3f33de8e8c89)

---

## ✨ Features

- **⚡️ Instant Terminal Summary:** Get a high-level breakdown of your recent sessions directly in your terminal on startup.
- **🛡️ Local Analyzer:** Your Codex usage data is read locally, and the dashboard runs on `127.0.0.1`.
- **📈 Usage Analytics:** Visualizations for daily token usage, model breakdowns, and token categories.
- **💡 Actionable Insights:** identify "One-Word Reply" traps, "Tab Hoarder" habits, and "Night Owl" patterns to save real money.
- **📂 Project Breakdown:** See exactly which repositories or directories are consuming the most tokens.
- **💰 Cost Estimates:** Includes **Prompt Caching (90% discount)** and **Reasoning Tokens** in estimated costs.
- **Model-Aware Pricing:** Known Codex models are priced directly; unknown models are surfaced with a pricing warning.

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
| `--help` | Show usage instructions | |

## 🛠️ How it Works

When you run `codex-spend`, the tool:
1. Locates your Codex CLI state (usually `~/.codex`).
2. Parses your `state_n.sqlite` database and `sessions/` transaction logs.
3. Automatically opens a beautiful local dashboard at `http://localhost:4321`.

### Requirements

- Node.js `>=18`
- `sqlite3` CLI installed on your system (used to read Codex state database)

## 💰 Understanding Codex Pricing

The dashboard uses estimated cost calculations based on OpenAI API per-token pricing (Standard tier).

- **Prompt Caching:** Codex gives you a **90% discount** on input tokens when it re-reads context it has seen recently. The dashboard highlights your "Cache Hit Rate" and estimated savings.
- **Reasoning Tokens:** Reasoning tokens are billed at output-token rates; the dashboard tracks them separately.
- **Model Coverage:** Pricing is applied for known mapped models. If a model is unknown, the dashboard warns that total cost may be underestimated.

## 🔐 Privacy

`codex-spend` is strictly a local analyzer. 
- It **never** reads your API keys.
- It does not upload your Codex usage payloads.
- The source code is open for audit.

## 📝 License

MIT

---

## 👨‍💻 Author

**Rishet Mehra**
- **GitHub:** [@Rishet11](https://github.com/Rishet11)
- **LinkedIn:** [Rishet Mehra](https://www.linkedin.com/in/rishetmehra/)
- **Email:** rishetmehra11@gmail.com
