# DPBoss Web Scraper

A web scraper built with Express.js, Puppeteer, and Cheerio to fetch data from the DPBoss website. Data is stored in Supabase.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager
- Supabase account and project

## Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Create a new table called `scrape_results` with the following columns:
   - `id` (int8, primary key, auto-increment)
   - `scraped_at` (timestamptz, not null)
   - `data` (jsonb, not null)
3. Copy your Supabase project URL and anon key from the project settings
4. Update the `.env` file with your credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

## Installation

1. Install the dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will start running on http://localhost:3000

## API Endpoints

1. Fetch new data:
   - GET `/scrape`
   - This endpoint will scrape the current data from DPBoss website and store it in Supabase

2. View historical data:
   - GET `/history`
   - This endpoint will return the last 10 scraped results from the database

## Note

The scraper is configured to work with the DPBoss website structure. If the website structure changes, you may need to update the selectors in the scraping function. 