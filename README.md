<div align="center">

# Trip Expense Tracker

### Split costs fairly. Settle debts effortlessly. Works offline.

A privacy-first Progressive Web App for tracking and settling group travel expenses — no servers, no sign-ups, no data leaves your browser.

[![Svelte 5](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Offline_Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://your-username.github.io/Trip-Expense-Tracker/) · [Report Bug](https://github.com/your-username/Trip-Expense-Tracker/issues) · [Request Feature](https://github.com/your-username/Trip-Expense-Tracker/issues)

</div>

---

## Why Trip Expense Tracker?

Traveling with friends is fun — until someone asks *"who owes what?"*

Trip Expense Tracker solves this by letting your group log every shared expense on the go, split costs fairly (equally, by custom amounts, or by percentage), and at the end of the trip, calculate the **minimum number of payments** needed to settle all debts. It supports multiple currencies, works in both English and Persian, and runs entirely in your browser — even without an internet connection.

No accounts. No cloud. No tracking. Just math and fairness.

---

## Features

### Core Expense Management

- **Multi-trip support** — manage unlimited independent trips, each with its own participants, currencies, and expenses
- **Flexible splitting** — split expenses equally, by custom amounts, or by percentage
- **Multi-currency** — 24 predefined currencies with quick-add, plus custom currency support
- **Integer-cent arithmetic** — calculations avoid floating-point rounding errors
- **Smart settlement** — a greedy algorithm computes the minimum number of transactions to settle all debts

### AI-Powered Receipt Scanning

- **Receipt capture** — snap a photo or upload an image of any receipt
- **AI extraction** — an OpenAI-compatible vision model (via OpenRouter or any compatible API) extracts the amount, date, merchant, and more
- **Barcode & QR scanning** — WASM-powered barcode reader merges data from receipt QR codes, including Iranian tax system URLs
- **Zero lock-in** — bring your own API key; the AI integration is completely optional

### Internationalization

- **Bilingual** — full English and Persian (Farsi) translations with 440+ localized strings
- **RTL support** — seamless right-to-left layout when using Persian
- **Dual calendar** — switch between Gregorian and Jalali (Solar Hijri) date display
- **Persian typography** — Vazirmatn font loaded automatically for the Persian locale

### Data Portability

- **JSON export/import** — export individual trips or back up everything; import to restore or share
- **CSV import wizard** — map columns, parse flexible date formats, and bulk-import expenses from spreadsheets
- **No vendor lock-in** — your data is plain JSON in `localStorage`, always accessible and portable

### Offline-First PWA

- **Install anywhere** — add to your home screen on iOS, Android, or desktop
- **Works without internet** — Workbox service worker caches all assets (JS, CSS, HTML, WASM) after the first visit
- **Instant loads** — cached assets mean the app launches in milliseconds, even on slow connections

### User Experience

- **Light & dark themes** — toggle between themes; preference is persisted
- **Search & sort** — find trips by name, description, participant, or expense; sort by date, name, or last updated
- **Archive trips** — keep completed trips out of the way without deleting them
- **Duplicate trips** — clone a trip's setup for recurring group travels
- **Toast notifications** — non-intrusive feedback for every action
- **Responsive design** — works on phones, tablets, and desktops

---

## Screenshots

> *Add your screenshots here — the app supports both light and dark themes!*

| Light Mode | Dark Mode |
|:---:|:---:|
| *screenshot* | *screenshot* |

---

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Framework** | Svelte 5 (Runes) | Reactive, compiled, minimal bundle size |
| **Language** | TypeScript 5.8 (strict) | Type safety across the entire codebase |
| **Build** | Vite 6 | Fast HMR in dev, optimized production builds |
| **Styling** | Tailwind CSS 4 | Utility-first with custom OKLCH design tokens |
| **Icons** | Lucide (Svelte) | Consistent, tree-shakeable inline SVGs |
| **PWA** | vite-plugin-pwa + Workbox | Reliable offline caching and installability |
| **Barcode** | zxing-wasm | In-browser WASM barcode/QR scanning — no network needed |
| **Deployment** | GitHub Pages + Actions | Automated CI/CD on every push to `main` |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  Svelte  │  │  Stores  │  │   localStorage    │ │
│  │Components│◄►│ (global  │◄►│  (persistence +   │ │
│  │  + Runes │  │  state)  │  │  debounced save)  │ │
│  └──────────┘  └──────────┘  └───────────────────┘ │
│       │                                             │
│  ┌────▼─────┐  ┌──────────┐  ┌───────────────────┐ │
│  │  Engine  │  │ Services │  │   Service Worker  │ │
│  │ (balance,│  │(receipt, │  │  (Workbox offline  │ │
│  │  settle, │  │ barcode) │  │    asset cache)   │ │
│  │  splits) │  └──────────┘  └───────────────────┘ │
│  └──────────┘                                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  i18n (en/fa) + Calendar (Gregorian/Jalali)  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │ (optional, user-configured)
         ▼
┌─────────────────────┐
│  OpenRouter / any   │
│  OpenAI-compatible  │
│  vision API         │
└─────────────────────┘
```

**Key architectural decisions:**

- **No backend** — all logic runs in the browser for maximum privacy
- **Hash-based routing** — `#/trip/{id}/{tab}` navigation without a router library
- **Debounced persistence** — state saves to `localStorage` every 300ms with an immediate flush on page unload
- **Calculation engine** — pure functions for balance computation, share splitting, and settlement optimization, separated from UI components

---

## Project Structure

```
src/
├── App.svelte                    # Root component + hash router
├── main.ts                      # Entry point
├── styles/app.css                # Tailwind config + theme tokens
│
├── components/
│   ├── trips/                    # Trip list, create/edit forms
│   ├── home/                     # Trip dashboard with stats
│   ├── participants/             # Participant management
│   ├── currencies/               # Currency management + quick-add
│   ├── expenses/                 # Expense list + split form
│   ├── balances/                 # Per-currency balance breakdown
│   ├── settlement/               # Exchange rates + settlement calc
│   ├── settings/                 # Preferences, import/export, CSV wizard
│   ├── receipt/                  # AI receipt scanner
│   ├── layout/                   # Header, TabBar, EmptyState
│   └── ui/                       # Modal, ConfirmDialog, Toast
│
├── lib/
│   ├── engine/                   # Pure business logic
│   │   ├── balances.ts           #   Balance computation
│   │   ├── settlement.ts         #   Minimum-transaction settlement
│   │   ├── shares.ts             #   Equal/custom/percentage splits
│   │   └── calendar.ts           #   Gregorian ↔ Jalali conversion
│   │
│   ├── stores/                   # Svelte stores (global state)
│   │   ├── data.ts               #   Trip data + localStorage sync
│   │   ├── settings.ts           #   Theme, calendar, locale
│   │   ├── aiSettings.ts         #   AI API configuration
│   │   └── toast.ts              #   Toast notifications
│   │
│   ├── services/                 # External integrations
│   │   ├── receiptScanner.ts     #   AI vision API calls
│   │   └── barcodeScanner.ts     #   WASM barcode/QR scanning
│   │
│   ├── i18n/                     # Translations
│   │   ├── index.ts              #   Locale store + helpers
│   │   ├── en.json               #   English strings
│   │   └── fa.json               #   Persian strings
│   │
│   ├── utils/                    # Shared utilities
│   │   ├── format.ts             #   Amount/currency formatting
│   │   ├── validation.ts         #   Input validation rules
│   │   ├── normalize.ts          #   Data integrity on load/import
│   │   ├── csv-parser.ts         #   CSV parsing + delimiter detection
│   │   ├── csv-mapper.ts         #   Auto column mapping
│   │   ├── csv-transformer.ts    #   CSV → expense transformation
│   │   └── id.ts                 #   UUID generation
│   │
│   └── types.ts                  # Shared TypeScript interfaces
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (included with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/Trip-Expense-Tracker.git
cd Trip-Expense-Tracker

# Install dependencies
npm install
```

### Development

```bash
# Start the dev server with hot module replacement
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
# Build for production
npm run build

# Preview the production build locally
npm run preview
```

The optimized output is written to the `dist/` directory.

### Deployment

The project includes a GitHub Actions workflow that automatically builds and deploys to GitHub Pages on every push to `main`. No additional configuration is needed beyond enabling GitHub Pages in your repository settings.

---

## How It Works

### 1. Create a Trip

Give your trip a name and optional description. Each trip is fully isolated with its own participants, currencies, expenses, and settlement configuration.

### 2. Add Participants

Add everyone in the group. Participant names must be unique (case-insensitive) and can be edited later — changes cascade to all related expenses.

### 3. Set Up Currencies

Pick from 24 predefined currencies or add custom ones. If your trip spans multiple currencies, the settlement engine will handle conversion using exchange rates you provide.

### 4. Record Expenses

For each expense, specify:
- **Who paid** — the person who covered the cost
- **How much** — the total amount
- **Which currency** — the currency used
- **Who benefits** — select all or specific participants
- **How to split** — equally, by custom amounts, or by percentage

You can also scan a receipt with AI to auto-fill these fields.

### 5. Review Balances

The balances tab shows a live breakdown per currency: how much each person paid, how much they owe, and their net position (creditor, debtor, or settled).

### 6. Settle Up

Choose a settlement currency, set exchange rates for any other currencies used, and the app computes the **minimum number of payments** needed to settle all debts. Each transaction tells you exactly who pays whom and how much.

---

## AI Receipt Scanning

The receipt scanner is an optional feature that uses a vision-capable AI model to extract expense data from receipt photos.

### Setup

1. Go to **Settings** > **AI Settings**
2. Enter your API base URL (default: `https://openrouter.ai/api/v1`)
3. Enter your API key
4. Choose a vision-capable model

### How It Works

1. Capture a photo or upload an image of a receipt
2. The AI analyzes the image and extracts structured data (amount, date, merchant, etc.)
3. If a barcode/QR code is present, the WASM scanner extracts additional data and merges it
4. Review and confirm the extracted data before saving as an expense

The AI integration is **completely optional** — the app is fully functional without it.

---

## Data Model

```
AppState
└── trips: Trip[]
    └── Trip
        ├── id, name, description
        ├── archived, createdAt, updatedAt
        └── data: AppData
            ├── participants: { id, name }[]
            ├── currencies: { code, symbol }[]
            ├── expenses: Expense[]
            │   └── Expense
            │       ├── id, date, description, amount
            │       ├── currencyCode, paidBy
            │       ├── splitType: equal | custom | percentage
            │       ├── beneficiaries: { id, amount? }[]
            │       └── aiMetadata? (from receipt scanner)
            ├── exchangeRates: { from, to, rate }[]
            └── settlementCurrency: string | null
```

All data is stored as JSON in `localStorage` under the key `trip-expense-tracker-state`.

---

## Contributing

Contributions are welcome! Whether it's a bug fix, new feature, translation, or documentation improvement — all help is appreciated.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is open source and available under the [MIT License](LICENSE).

---

<div align="center">

Built with Svelte, powered by the browser, designed for travelers.

</div>
