require('dotenv').config();
const express = require('express');
// Dynamically import puppeteer or puppeteer-core based on environment
const puppeteer = process.env.NODE_ENV === 'production' 
    ? require('puppeteer-core')
    : require('puppeteer');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3001;

// Add middleware to parse JSON
app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Basic error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Something went wrong!'
    });
});

// Add a basic health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'Server is running',
        last_update: lastUpdateTime,
        next_update: nextUpdateTime
    });
});

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Variables to track update times
let lastUpdateTime = null;
let nextUpdateTime = null;
const UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// Function to scrape satta main results
async function scrapeSattaResults() {
    let browser = null;
    try {
        console.log('Launching browser...');
        
        // Determine the Chrome path based on the environment
        let executablePath;
        if (process.platform === 'win32') {
            // Windows path
            executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        } else {
            // Linux path
            executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
        }
        
        console.log('Using Chrome executable path:', executablePath);
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,800'
            ],
            executablePath: executablePath,
            ignoreHTTPSErrors: true,
            defaultViewport: {
                width: 1280,
                height: 800,
                deviceScaleFactor: 1,
            }
        });
        
        console.log('Browser launched successfully');
        
        console.log('Creating new page...');
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Add error handling for navigation
        console.log('Navigating to spboss.in...');
        try {
            const response = await page.goto('https://spboss.in', { 
                waitUntil: ['domcontentloaded', 'networkidle0'],
                timeout: 60000 // 60 seconds timeout
            });
            
            if (!response || !response.ok()) {
                throw new Error(`Failed to load the page. Status: ${response ? response.status() : 'unknown'}`);
            }
        } catch (navigationError) {
            console.error('Navigation error:', navigationError);
            throw new Error('Failed to load the website. Please try again later.');
        }
        
        console.log('Getting page content...');
        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Initialize object to store scraped data
        const scrapedData = {
            timestamp: new Date().toISOString(),
            results: []
        };

        // Extract data from .satta-main-result div
        $('.satta-main-result div').each((i, element) => {
            const $element = $(element);
            
            // Get the market name from h4
            const marketName = $element.find('h4').text().trim();
            
            // Get the numbers from span
            const numberSpan = $element.find('span').text().trim();
            
            // Parse the numbers (assuming format like "599-39-568")
            const numbers = numberSpan.split('-');
            
            const resultData = {
                market_name: marketName,
                full_number: numberSpan,
                numbers: {
                    open: numbers[0] || '',
                    jodi: numbers[1] || '',
                    close: numbers[2] || ''
                },
                raw_text: $element.text().trim(),
                position: i + 1,
                timestamp: new Date().toISOString()
            };

            // Only add if we have either market name or numbers
            if (marketName || numberSpan) {
                scrapedData.results.push(resultData);
            }
        });

        console.log(`Found ${scrapedData.results.length} market results`);
        
        await browser.close();
        console.log('Browser closed successfully');
        
        // Save to Supabase
        console.log('Saving to Supabase...');
        const { data, error } = await supabase
            .from('scrape_results')
            .insert([
                {
                    scraped_at: new Date().toISOString(),
                    data: scrapedData
                }
            ])
            .select();

        if (error) {
            console.error('Supabase error:', error);
            if (error.code === '42P01') {
                throw new Error('Table "scrape_results" does not exist. Please create the table first.');
            } else if (error.message?.includes('policy')) {
                throw new Error('Database permission error. Please check Row Level Security (RLS) policies.');
            }
            throw error;
        }

        // Update timing information
        lastUpdateTime = new Date();
        nextUpdateTime = new Date(lastUpdateTime.getTime() + UPDATE_INTERVAL);

        return {
            ...scrapedData,
            saved_id: data?.[0]?.id,
            last_update: lastUpdateTime,
            next_update: nextUpdateTime
        };
    } catch (error) {
        console.error('Scraping error:', error);
        throw error;
    } finally {
        if (browser) {
            try {
                console.log('Closing browser...');
                await browser.close();
                console.log('Browser closed successfully');
            } catch (closeError) {
                console.error('Error closing browser:', closeError);
            }
        }
    }
}

// Function to perform automatic updates
async function performAutoUpdate() {
    try {
        console.log('Starting automatic update...');
        await scrapeSattaResults();
        console.log('Automatic update completed successfully');
        console.log(`Next update scheduled for: ${nextUpdateTime}`);
    } catch (error) {
        console.error('Error in automatic update:', error.message);
        // Add a retry mechanism
        setTimeout(performAutoUpdate, 5 * 60 * 1000); // Retry after 5 minutes
    }
}

// Schedule automatic updates
setInterval(performAutoUpdate, UPDATE_INTERVAL);

// Perform initial scrape when server starts
performAutoUpdate();

// API Endpoints
app.get('/scrape', async (req, res) => {
    try {
        console.log('Starting scraping process...');
        const data = await scrapeSattaResults();
        console.log('Scraping completed successfully');
        res.json({
            success: true,
            data: data,
            last_update: lastUpdateTime,
            next_update: nextUpdateTime
        });
    } catch (error) {
        console.error('Error in /scrape endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'An error occurred while scraping'
        });
    }
});

// Get historical data
app.get('/history', async (req, res) => {
    try {
        console.log('Fetching historical data...');
        const { data, error } = await supabase
            .from('scrape_results')
            .select('*')
            .order('scraped_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Supabase error in /history:', error);
            throw error;
        }

        console.log('Historical data fetched successfully');
        res.json({
            success: true,
            data: data,
            last_update: lastUpdateTime,
            next_update: nextUpdateTime
        });
    } catch (error) {
        console.error('Error in /history endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'An error occurred while fetching history'
        });
    }
});

// Get update status
app.get('/status', async (req, res) => {
    res.json({
        success: true,
        last_update: lastUpdateTime,
        next_update: nextUpdateTime,
        update_interval_hours: UPDATE_INTERVAL / (60 * 60 * 1000)
    });
});

// Handle 404 errors
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Automatic updates scheduled every ${UPDATE_INTERVAL / (60 * 60 * 1000)} hours`);
    console.log('Available endpoints:');
    console.log('- GET /         (Health check)');
    console.log('- GET /scrape   (Scrape satta results)');
    console.log('- GET /history  (View historical data)');
    console.log('- GET /status   (Check update status)');
}); 