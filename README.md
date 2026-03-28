# LinkedIn AI Assistant — Chrome Extension

A privacy-first LinkedIn content assistant powered by **Ollama running locally**. No scraping, no automation, no external API calls.

---

## Prerequisites

- **Node.js** 18+
- **Ollama** installed → https://ollama.com/download
- **VS Code** (recommended)

---

## 1. Install Ollama & Pull a Model

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama
ollama serve

# Pull your first model (in a new terminal)
ollama pull mistral
```

> For low-RAM machines (8GB): use `phi3:mini`
> For best quality (16GB+): use `llama3` or `gemma2:9b`

---

## 2. Project Setup

```bash
# Install dependencies
npm install

# Start development build with hot reload
npm run dev
```

---

## 3. Load in Chrome

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder in this project

The extension icon will appear in your toolbar.

---

## 4. First Run

1. Click the extension icon → click **Open Dashboard →**
2. Go to the **Profile** tab and fill in your brand profile
3. Go to **Settings** and confirm Ollama shows as online
4. Head to **Draft** and generate your first post

---

## Project Structure

```
linkedin-ai-extension/
├── manifest.json              # Chrome Extension Manifest V3
├── vite.config.ts             # Build config with CRXJS plugin
├── tailwind.config.js
├── src/
│   ├── types/index.ts         # All TypeScript interfaces
│   ├── lib/
│   │   ├── ollama.ts          # Ollama client (generate, stream, chat, list models)
│   │   ├── storage.ts         # Chrome Storage API wrapper
│   │   ├── db.ts              # IndexedDB via Dexie (drafts, logs, results)
│   │   └── prompts.ts         # 10 production-ready prompt templates
│   ├── background/index.ts    # Service worker (alarms, messaging)
│   ├── popup/                 # Extension popup (380px wide)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── Popup.tsx          # Quick draft + Ollama status
│   │   └── style.css
│   └── dashboard/             # Full-page dashboard
│       ├── index.html
│       ├── main.tsx
│       ├── Dashboard.tsx      # Tab shell + sidebar
│       └── tabs/
│           ├── DraftTab.tsx   # Post / recruiter / hooks / CTA generation + rewrite
│           ├── ScoreTab.tsx   # Draft quality scorer with rubric
│           ├── PlannerTab.tsx # Pillar generator + weekly plan
│           ├── AnalyticsTab.tsx # Manual performance logger + AI insights
│           ├── ProfileTab.tsx # Brand profile setup
│           └── SettingsTab.tsx # Ollama URL, model picker, recommended models
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Build in watch mode (auto-rebuilds on save) |
| `npm run build` | Production build to `dist/` |
| `npm run type-check` | TypeScript check without building |

---

## Permissions (Minimal by Design)

| Permission | Why |
|---|---|
| `storage` | Save profile, settings, drafts in Chrome local storage |
| `alarms` | Daily content reminder notification |

**No LinkedIn host permissions. No `tabs`. No `activeTab`. No external API calls.**

---

## Adding a New Model

```bash
ollama pull <model-name>
```

Then go to **Settings** in the dashboard → click **Test** → your new model appears in the dropdown.

---

## Compliance Notes

This extension:
- ✅ Does NOT scrape LinkedIn
- ✅ Does NOT inject scripts into LinkedIn pages
- ✅ Does NOT automate any LinkedIn actions
- ✅ Sends zero data to external servers
- ✅ All AI runs 100% on your local machine via Ollama
