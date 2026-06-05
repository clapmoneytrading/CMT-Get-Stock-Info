# MarketSmith Stock Dashboard

Local dashboard to search MarketSmith India, capture stock metrics, and store them in SQLite.

## Setup

```bash
npm install
npm start
```

Open http://localhost:3000

## Notes

- The scraper uses a generic search URL and tries to extract fields by matching label text.
- If the MarketSmith site renders data client-side or requires login, the current scraper will not find data.
- If you see errors, share the stock page HTML or the correct search URL so we can tune the selectors.
- Manual fallback: if a stock is missing, use the manual entry panel to save the record locally.
- Admin refresh: use the refresh button to re-fetch the latest data for all stored stocks.
