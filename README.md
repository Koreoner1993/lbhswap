# Labour By Hire — TON ⇄ LBH Swap (STON.fi + TON Connect)

This is a Vite + React swap page that:
- connects wallets via **TON Connect** (`@tonconnect/ui-react`)
- fetches swappable assets from **STON.fi API** (`@ston-fi/api`)
- simulates routes + min received
- sends a real swap transaction using **STON.fi SDK** (`@ston-fi/sdk`)
- pops confetti on successful wallet prompt ✅

## 1) Configure LBH preload (recommended)

Create `.env` from the example:

```bash
cp .env.example .env
```
[text](.env.example)
Then set:

```bash
VITE_LBH_JETTON_MASTER=EQ...YOUR_LBH_JETTON_MASTER_ADDRESS...
```

If you *don’t* set it, the UI still works, but it will pick defaults from the STON.fi asset list.

## 2) Install & run

Using npm:

```bash
npm install
npm run dev
```

Or pnpm:

```bash
pnpm install
pnpm dev
```

## 3) Deploy to GitHub Pages

### Option A (simplest): Deploy like your current repo (Pages from `main`)

1. Build:
   ```bash
   npm run build
   ```
2. Copy `dist/` contents into your repo root (or set Pages to use `/docs`).
3. Make sure **`tonconnect-manifest.json` is reachable** at:
   - `https://YOUR_GH_PAGES_DOMAIN/tonconnect-manifest.json`

### Option B (recommended): GitHub Pages from `gh-pages` branch
Use the usual `gh-pages` workflow or GitHub Actions to publish `dist/`.

## 4) Update TON Connect manifest

Edit `public/tonconnect-manifest.json`:

- `url` should be your public site URL (no trailing slash recommended)
- `iconUrl` should be a PNG/ICO (180×180 PNG recommended)

TON’s official manifest requirements are in the TON Docs.

## Notes / gotchas

- Users need a bit of TON for gas fees.
- On mobile wallets, the approval sheet can close quickly if your site is not served over HTTPS or if the manifest is not accessible.
- If swaps fail, open dev console: the error reason is usually there.

