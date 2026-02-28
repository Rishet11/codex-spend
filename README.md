# 💸 codex-spend

**See where your OpenAI Codex tokens go. One command, zero setup.**

`codex-spend` is a beautiful, privacy-first local dashboard that analyzes your OpenAI Codex CLI usage. It runs entirely on your machine, reads your local transaction logs, and visualizes exactly how many tokens you're using, how much they cost, and how you can optimize your usage.

![codex-spend dashboard](https://github.com/user-attachments/assets/demo.png) *(You can add a screenshot here later!)*

## 🚀 Features

- **Privacy First:** Never sends your data anywhere. Runs completely offline on `http://127.0.0.1`.
- **Accurate Billing:** Understands the nuanced OpenAI billing model, including the **90% discount on cached prompts** and the fact that reasoning tokens are billed as output tokens.
- **Interactive Charts:** Beautiful `Chart.js` visualizations for daily spend and model breakdowns.
- **Actionable Insights:** Get personalized recommendations based on your usage patterns (e.g., how to maximize cache hits during marathon debugging sessions).
- **Supports All Codex Models:** Tracks usage across `gpt-5.3-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`, and more.

## 📦 Installation

You can run `codex-spend` instantly without installing it globally using `npx`:

```bash
npx codex-spend
```

Or, if you prefer to install it globally:

```bash
npm install -g codex-spend
codex-spend
```

## 🛠️ How it Works

When you run `codex-spend`, the tool:
1. Locates your Codex CLI state folder (usually `~/.codex`).
2. Parses your `state_5.sqlite` database and `sessions/` JSONL logs.
3. Calculates exact token usage (Fresh Input, Cached Input, Output, and Reasoning).
4. Spins up a lightweight local server on port `4321`.
5. Automatically opens your default web browser to display your personalized dashboard.

## 💰 Understanding Codex Pricing

The dashboard uses the official OpenAI API per-token pricing (Standard tier). Here are a few things to keep in mind:
- **Prompt Caching:** You get a **90% discount** on input tokens when Codex re-reads context it has seen recently. The dashboard splits this out and highlights your savings!
- **Reasoning Tokens:** High-effort reasoning models generate internal "thinking" tokens. These consume your context window and are billed identically to standard output tokens. They are tracked as a subset of your output tokens in the dashboard.
- **API Mode:** This tool calculates spend based on individual API token costs. If you are using Codex via a ChatGPT Plus/Pro subscription, your usage is actually tracked via a rolling time-based limit (and flexible credits) rather than direct per-token billing, but this dashboard still serves as an excellent gauge of your "virtual" consumption!

## 🔐 Privacy

`codex-spend` is strictly a local analyzer. It **does not** read your OpenAI API keys, and it **does not** send any telemetrics, logs, or usage data to any external server. 

## 📝 License

MIT
