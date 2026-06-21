# Trip Expense Tracker

A progressive web application (PWA) for tracking and settling group travel expenses. Works fully offline.

## Tech Stack

- **Svelte 5** + Vite + TypeScript
- **Tailwind CSS v4** (locally bundled, no CDN)
- **vite-plugin-pwa** (Workbox service worker)
- **Lucide Icons** (inline SVG)

## Features

- Manage trip participants
- Multi-currency support with 24 predefined currencies
- Record expenses with equal, custom, or percentage splits
- Live balance breakdown per currency
- Settlement calculation with minimum transactions
- Gregorian and Jalali (Persian) calendar support
- JSON import/export
- Light/Dark theme
- Fully offline-capable PWA

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Offline

After the first visit, all assets are cached by the service worker. The app works completely offline with data stored in localStorage.
