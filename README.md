# Portfolio Tracker

Android app (React Native · Expo SDK 57 · TypeScript) that tracks a stock/ETF portfolio with prices from the [Twelve Data](https://twelvedata.com) API.

- **Overview** – total value, today's gain, total gain vs. net invested, 30-day sparkline, allocation.
- **Calendar** – month grid with each day's gain/loss (color intensity scales with the move), monthly total and %, up/down days, best/worst day, and a per-holding breakdown for the selected day.
- **Timeline** – portfolio value vs. net invested over 1M / 3M / 6M / 1Y / All, drag to inspect any day, monthly gains.
- **Holdings** – open positions (average cost, last price, unrealized and realized P/L) and the trade log.
- **Settings** – API key (verified, stored encrypted), base currency, rate limit, cache reset.

## Get the APK

### Option A — GitHub Actions (no local Android setup)
1. Push this folder to a new GitHub repository.
2. The **Build Android APK** workflow runs on every push to `main` (or start it from the *Actions* tab).
3. Open the finished run → *Artifacts* → download `portfolio-tracker-apk` → unzip → copy `app-release.apk` to your phone and install it (allow "install unknown apps" for your file manager).

The APK is signed with the debug key: fine for personal sideloading, not for the Play Store.

### Option B — EAS Build (Expo's cloud)
```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```
EAS creates and keeps a proper signing key and gives you a download link/QR code for the APK.

### Option C — Local build
Requires Android Studio (SDK) and JDK 17.
```bash
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## First run
1. Create a free key at twelvedata.com (free plan: 8 credits/min, 800/day).
2. *Settings* → paste the key → **Verify & save**.
3. *Holdings* → **+** → add your buys/sells. Use **Use closing price for this date** if you don't remember the fill price.
4. Prices sync automatically on launch (if older than 15 min) and on pull-to-refresh.

Symbols: US tickers work as-is (`AAPL`, `VOO`). For other listings add the exchange: `SAP` + `XETR`, `MC` + `Euronext`, `VOD` + `LSE`.

## How the numbers are computed
- **Daily gain** = `value(today) − value(previous day) − net cash flow today`. Buying or selling never counts as a gain or loss by itself; only price moves do.
- **Total gain** = current value − net invested (all buys incl. fees − all sell proceeds), so it includes realized and unrealized P/L.
- Prices are daily closes, forward-filled over weekends/holidays. Today's bar is live while the market is open.
- Holdings in other currencies are converted to the base currency with daily FX closes from Twelve Data (e.g. `USD/EUR`). London `GBp` (pence) quotes are handled.
- Position cost basis uses the average-cost method.

## API usage
- One request (= 1 credit) per symbol and per FX pair. Full history is fetched once; later syncs only request the last few days.
- Requests go out in batches of 8 (your plan's credits per minute, configurable in Settings): one batch is sent in parallel, then the app waits for a fresh minute before the next batch. 20 symbols take three batches, about 2 minutes. A countdown shows while it waits.
- Every Twelve Data call in the app (syncing, adding a trade, verifying the key) shares the same 8-per-minute budget.
- If Twelve Data still answers 429 (e.g. the key is used elsewhere), the request is retried once in the next minute's batch, then reported as a warning.
- The key is sent in the `Authorization` header, never in the URL, and is stored with `expo-secure-store` (Android Keystore).

## Project structure
```
src/
  app/                  Expo Router screens
    (tabs)/             index (overview), calendar, timeline, holdings, settings
    transaction/new.tsx Add-trade modal
  api/                  Twelve Data client + rate limiter (typed, injectable fetch)
  domain/               Pure logic: dates, portfolio math, validation (no React)
  services/priceSync.ts Incremental price/FX download
  store/                zustand stores persisted to AsyncStorage / SecureStore
  hooks/                usePortfolio (derived series), hydration
  components/           UI kit, SVG line chart, month calendar
  theme/, utils/        Light/dark palettes, formatting
```

## Development
```bash
npm install
npx expo run:android   # dev build on a device/emulator
npm test               # unit tests (domain, sync, API client)
npm run typecheck
npm run lint
```
