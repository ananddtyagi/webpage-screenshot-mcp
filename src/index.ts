#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync, spawn } from 'child_process';
import fs, { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import puppeteer, { Browser, Cookie, Page } from 'puppeteer';
import { z } from 'zod';

// Create the MCP server
const server = new McpServer({
    name: "screenshot-page",
    version: "1.0.0",
});

let browser: Browser | null = null;
let persistentPage: Page | null = null;
const cookiesDir = path.join(os.homedir(), '.mcp-screenshot-cookies');

// Ensure cookies directory exists
async function ensureCookiesDir() {
    try {
        await fsPromises.mkdir(cookiesDir, { recursive: true });
    } catch (error) {
        console.error('Error creating cookies directory:', error);
    }
}

// Get path to default Chrome/Edge installation
function getDefaultBrowserPath(): string | null {
    try {
        if (process.platform === 'darwin') {
            // Check for Chrome first
            try {
                return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            } catch (e) {
                // Then check for Edge
                try {
                    return '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
                } catch (e) {
                    // Then Safari (though Puppeteer doesn't work well with Safari)
                    return '/Applications/Safari.app/Contents/MacOS/Safari';
                }
            }
        } else if (process.platform === 'win32') {
            // On Windows, try to find Chrome or Edge
            try {
                const chromePath = execSync('where chrome').toString().trim();
                if (chromePath) return chromePath;
            } catch (e) {
                try {
                    const edgePath = execSync('where msedge').toString().trim();
                    if (edgePath) return edgePath;
                } catch (e) {
                    // Fall back to default installation paths
                    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
                    const chromePath = `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`;
                    const edgePath = `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`;
                    
                    try {
                        if (fs.existsSync(chromePath)) return chromePath;
                        if (fs.existsSync(edgePath)) return edgePath;
                    } catch (e) {
                        // Ignore filesystem errors
                    }
                }
            }
        } else if (process.platform === 'linux') {
            // On Linux, try common browser paths
            try {
                const chromePath = execSync('which google-chrome').toString().trim();
                if (chromePath) return chromePath;
            } catch (e) {
                try {
                    const chromiumPath = execSync('which chromium-browser').toString().trim();
                    if (chromiumPath) return chromiumPath;
                } catch (e) {
                    // No default browser found
                }
            }
        }
    } catch (e) {
        console.error('Error finding default browser:', e);
    }
    return null;
}

// Initialize browser instance
async function initBrowser(headless: boolean = true, useDefaultBrowser: boolean = false): Promise<Browser> {
    if (browser) {
        // Check if we need to switch modes or browser type
        const isHeadless = browser.process()?.spawnargs?.includes('--headless') ?? true;
        const isUsingDefaultBrowser = browser.process()?.spawnargs?.includes('--remote-debugging-port') ?? false;
        
        if (isHeadless !== headless || isUsingDefaultBrowser !== useDefaultBrowser) {
            await browser.close();
            browser = null;
            persistentPage = null;
        }
    }
    
    if (!browser) {
        if (useDefaultBrowser && !headless) {
            // Try to connect to default browser
            const defaultBrowserPath = getDefaultBrowserPath();
            
            if (!defaultBrowserPath) {
                console.error('Could not find default browser. Falling back to bundled Chromium.');
                                    browser = await puppeteer.launch({
                        executablePath: defaultBrowserPath ?? undefined,
                        headless: headless,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--disable-blink-features=AutomationControlled',
                            '--disable-features=VizDisplayCompositor',
                            '--disable-extensions-file-access-check',
                            '--disable-extensions-http-throttling',
                            '--disable-extensions-https-error-pages',
                            '--disable-extensions',
                            '--disable-background-timer-throttling',
                            '--disable-renderer-backgrounding',
                            '--disable-backgrounding-occluded-windows',
                            '--disable-ipc-flooding-protection',
                            '--disable-default-apps',
                            '--disable-sync',
                            '--disable-translate',
                            '--hide-scrollbars',
                            '--mute-audio',
                            '--no-default-browser-check',
                            '--no-pings',
                            '--disable-web-security',
                            '--disable-features=TranslateUI',
                            '--disable-features=BlinkGenPropertyTrees',
                            '--disable-client-side-phishing-detection',
                            '--disable-component-extensions-with-background-pages',
                            '--disable-default-apps',
                            '--disable-hang-monitor',
                            '--disable-prompt-on-repost',
                            headless ? '--disable-gpu' : ''
                        ].filter(Boolean)
                    });
            } else {
                // Use random debug port in allowed range (9222-9322)
                const debuggingPort = 9222 + Math.floor(Math.random() * 100);
                
                // Launch browser with debugging port
                const userDataDir = path.join(os.tmpdir(), `puppeteer_user_data_${Date.now()}`);
                
                // Launch browser process using spawn instead of execSync
                const browserProcess = spawn(
                    defaultBrowserPath,
                    [
                        `--remote-debugging-port=${debuggingPort}`,
                        `--user-data-dir=${userDataDir}`,
                        '--no-first-run',
                        'about:blank'
                    ],
                    { stdio: 'ignore', detached: true }
                );
                
                // Detach the process so it continues running after our process exits
                browserProcess.unref();
                
                // Wait for browser to start
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Connect to the browser
                try {
                    browser = await puppeteer.connect({
                        browserURL: `http://localhost:${debuggingPort}`,
                        defaultViewport: null
                    });
                    
                    // Store user data dir for cleanup
                    (browser as any).__userDataDir = userDataDir;
                } catch (error) {
                    console.error('Failed to connect to browser:', error);
                    // Fall back to bundled browser
                    browser = await puppeteer.launch({
                        executablePath: defaultBrowserPath ?? undefined,
                        headless: headless,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--disable-blink-features=AutomationControlled',
                            '--disable-features=VizDisplayCompositor',
                            '--disable-extensions',
                            '--disable-background-timer-throttling',
                            '--disable-renderer-backgrounding',
                            '--disable-backgrounding-occluded-windows',
                            '--disable-ipc-flooding-protection',
                            '--disable-default-apps',
                            '--disable-sync',
                            '--disable-translate',
                            '--hide-scrollbars',
                            '--mute-audio',
                            '--no-default-browser-check',
                            '--no-pings',
                            '--disable-web-security',
                            '--disable-features=TranslateUI',
                            '--disable-features=BlinkGenPropertyTrees',
                            '--disable-client-side-phishing-detection'
                        ].filter(Boolean)
                    });
                }
            }
        } else {
            // Use bundled browser
            browser = await puppeteer.launch({
                headless: headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-ipc-flooding-protection',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--no-pings',
                    '--disable-web-security',
                    '--disable-features=TranslateUI',
                    '--disable-features=BlinkGenPropertyTrees',
                    '--disable-client-side-phishing-detection',
                    headless ? '--disable-gpu' : ''
                ].filter(Boolean)
            });
        }
    }
    return browser;
}

// Get domain from URL for cookie storage
function getDomainFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/\./g, '_');
    } catch {
        return 'unknown';
    }
}

// Save cookies for a domain
async function saveCookies(url: string, cookies: Cookie[]) {
    await ensureCookiesDir();
    const domain = getDomainFromUrl(url);
    const cookiesPath = path.join(cookiesDir, `${domain}.json`);
    await fsPromises.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
}

// Load cookies for a domain
async function loadCookies(url: string): Promise<Cookie[]> {
    try {
        const domain = getDomainFromUrl(url);
        const cookiesPath = path.join(cookiesDir, `${domain}.json`);
        const cookiesData = await fsPromises.readFile(cookiesPath, 'utf-8');
        return JSON.parse(cookiesData);
    } catch {
        return [];
    }
}

// Function to clean up resources
async function cleanupBrowser() {
    if (browser) {
        // Clean up user data directory if it exists (for default browser)
        const userDataDir = (browser as any).__userDataDir;
        
        try {
            await browser.close();
        } catch (error) {
            console.error('Error closing browser:', error);
        }
        
        // Clean up user data directory if it exists
        if (userDataDir) {
            try {
                await fsPromises.rm(userDataDir, { recursive: true, force: true });
            } catch (error) {
                console.error('Error cleaning up user data directory:', error);
            }
        }
        
        browser = null;
        persistentPage = null;
    }
}

// Cleanup browser on exit
process.on('exit', () => {
    if (browser) {
        // Can't use async here, so just do a sync cleanup of what we can
        try {
            browser.close().catch(() => {});
        } catch (e) {
            // Ignore errors on exit
        }
    }
});

process.on('SIGINT', async () => {
    await cleanupBrowser();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await cleanupBrowser();
    process.exit(0);
});

// Register the login-and-wait tool
server.tool(
    "login-and-wait",
    "Opens a webpage in a visible browser window for manual login, waits for user to complete login, then saves cookies",
    {
        url: z.string().url().describe("The URL of the login page"),
        waitMinutes: z.number().optional().default(3).describe("Maximum minutes to wait for login (default: 3)"),
        successIndicator: z.string().optional().describe("Optional CSS selector or URL pattern that indicates successful login"),
        useDefaultBrowser: z.boolean().optional().default(true).describe("Whether to use the system's default browser instead of Puppeteer's bundled Chromium")
    },
    async ({ url, waitMinutes, successIndicator, useDefaultBrowser }) => {
        let page: Page | null = null;
        
        try {
            // Initialize browser in non-headless mode with default browser option
            const browserInstance = await initBrowser(false, useDefaultBrowser);
            
            // Create or reuse persistent page
            if (!persistentPage || persistentPage.isClosed()) {
                persistentPage = await browserInstance.newPage();
            }
            page = persistentPage;
            
            // Load existing cookies if available
            const existingCookies = await loadCookies(url);
            if (existingCookies.length > 0) {
                await page.setCookie(...existingCookies);
            }
            
            // Set user agent and anti-detection measures for login
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Additional anti-detection measures for Google login
            await page.evaluateOnNewDocument(() => {
                // Remove webdriver property
                delete (window.navigator as any).webdriver;
                
                // Override the plugins property to add fake plugins
                Object.defineProperty(window.navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                
                // Override the languages property
                Object.defineProperty(window.navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
                
                // Override permissions
                Object.defineProperty(window.navigator, 'permissions', {
                    get: () => ({
                        query: () => Promise.resolve({ state: 'granted' })
                    })
                });
            });
            
            // Navigate to the URL
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            const startTime = Date.now();
            const maxWaitTime = waitMinutes * 60 * 1000;
            
            // Wait for login
            console.error(`Waiting for manual login... (up to ${waitMinutes} minutes)`);
            console.error(`Please complete the login in the ${useDefaultBrowser ? 'default' : 'Puppeteer'} browser window.`);
            console.error(`To continue immediately after login, use the 'signal-login-complete' tool or navigate away from the login page.`);
            
            if (successIndicator) {
                try {
                    // If it's a URL pattern
                    if (successIndicator.startsWith('http') || successIndicator.includes('/')) {
                        await page.waitForFunction(
                            (pattern) => window.location.href.includes(pattern),
                            { timeout: maxWaitTime },
                            successIndicator
                        );
                    } else {
                        // Otherwise treat as CSS selector
                        await page.waitForSelector(successIndicator, { timeout: maxWaitTime });
                    }
                } catch (timeoutError) {
                    // Continue even if indicator not found
                    console.error('Success indicator not found, but continuing...');
                }
            } else {
                // Wait for user confirmation via multiple methods
                await new Promise((resolve) => {
                    const checkInterval = setInterval(() => {
                        if (Date.now() - startTime > maxWaitTime) {
                            clearInterval(checkInterval);
                            resolve(null);
                        }
                    }, 1000);
                    
                    // Method 1: Page navigation detection
                    page?.on('framenavigated', () => {
                        const currentUrl = page?.url() || '';
                        // Check if we've navigated away from login pages
                        if (!currentUrl.includes('accounts.google.com') && 
                            !currentUrl.includes('login') && 
                            !currentUrl.includes('signin') &&
                            !currentUrl.includes('auth')) {
                            setTimeout(() => {
                                clearInterval(checkInterval);
                                resolve(null);
                            }, 2000);
                        }
                    });
                    
                    // Method 2: Check for a completion marker file
                    const completionFile = path.join(os.tmpdir(), 'mcp-login-complete.txt');
                    const fileCheckInterval = setInterval(async () => {
                        try {
                            if (fs.existsSync(completionFile)) {
                                await fsPromises.unlink(completionFile).catch(() => {});
                                clearInterval(checkInterval);
                                clearInterval(fileCheckInterval);
                                resolve(null);
                            }
                        } catch (e) {
                            // Ignore file check errors
                        }
                    }, 1000);
                    
                    // Clean up file checker when main interval ends
                    setTimeout(() => {
                        clearInterval(fileCheckInterval);
                    }, maxWaitTime);
                });
            }
            
            // Save cookies after login
            const cookies = await page.cookies();
            await saveCookies(url, cookies);
            
            const finalUrl = page.url();
            const browserType = useDefaultBrowser ? 'default browser' : 'Puppeteer browser';
            
            return {
                content: [
                    {
                        type: "text",
                        text: `Login session established and cookies saved!\n\nBrowser: ${browserType}\nInitial URL: ${url}\nFinal URL: ${finalUrl}\nCookies saved: ${cookies.length}\n\nLogin completed via: ${successIndicator ? 'success indicator detected' : 'automatic navigation detection or manual signal'}\n\nThe browser window will remain open for future screenshots.`
                    }
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error during login process: ${errorMessage}`,
                    },
                ],
            };
        }
        // Don't close the page - keep it for future use
    }
);

// Updated screenshot-page tool with authentication support
server.tool(
    "screenshot-page",
    "Captures a screenshot of a given URL and returns it as base64 encoded image. Can use saved cookies from login-and-wait.",
    {
        url: z.string().url().describe("The URL of the webpage to screenshot"),
        fullPage: z.boolean().optional().default(true).describe("Whether to capture the full page or just the viewport"),
        width: z.number().optional().default(1920).describe("Viewport width in pixels"),
        height: z.number().optional().default(1080).describe("Viewport height in pixels"),
        format: z.enum(['png', 'jpeg', 'webp']).optional().default('png').describe("Image format for the screenshot"),
        quality: z.number().min(0).max(100).optional().describe("Quality of the image (0-100), only applicable for jpeg and webp"),
        waitFor: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional().default('networkidle2').describe("When to consider the page loaded"),
        delay: z.number().optional().default(0).describe("Additional delay in milliseconds to wait after page load"),
        useSavedAuth: z.boolean().optional().default(true).describe("Whether to use saved cookies from previous login"),
        reuseAuthPage: z.boolean().optional().default(false).describe("Whether to use the existing authenticated page instead of creating a new one"),
        useDefaultBrowser: z.boolean().optional().default(false).describe("Whether to use the system's default browser instead of Puppeteer's bundled Chromium"),
        visibleBrowser: z.boolean().optional().default(false).describe("Whether to show the browser window (non-headless mode)")
    },
    async ({ url, fullPage, width, height, format, quality, waitFor, delay, useSavedAuth, reuseAuthPage, useDefaultBrowser, visibleBrowser }) => {
        let page: Page | null = null;
        let shouldClosePage = true;
        
        try {
            // Initialize browser with appropriate options
            const isHeadless = !visibleBrowser;
            const browserInstance = await initBrowser(isHeadless, useDefaultBrowser && visibleBrowser);
            
            // Check if we should reuse the authenticated page
            if (reuseAuthPage && persistentPage && !persistentPage.isClosed()) {
                page = persistentPage;
                shouldClosePage = false;
                
                // Navigate to the new URL if different
                const currentUrl = page.url();
                if (currentUrl !== url) {
                    await page.goto(url, {
                        waitUntil: waitFor as any,
                        timeout: 30000
                    });
                }
            } else {
                // Create a new page
                page = await browserInstance.newPage();
                
                // Load saved cookies if requested
                if (useSavedAuth) {
                    const cookies = await loadCookies(url);
                    if (cookies.length > 0) {
                        await page.setCookie(...cookies);
                    }
                }
                
                // Set viewport
                await page.setViewport({ width, height });
                
                // Set user agent to avoid bot detection
                await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
                // Additional anti-detection measures for Google
                await page.evaluateOnNewDocument(() => {
                    // Remove webdriver property
                    delete (window.navigator as any).webdriver;
                    
                    // Override the plugins property to add fake plugins
                    Object.defineProperty(window.navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5]
                    });
                    
                    // Override the languages property
                    Object.defineProperty(window.navigator, 'languages', {
                        get: () => ['en-US', 'en']
                    });
                    
                    // Override permissions
                    Object.defineProperty(window.navigator, 'permissions', {
                        get: () => ({
                            query: () => Promise.resolve({ state: 'granted' })
                        })
                    });
                });
                
                // Navigate to the URL
                await page.goto(url, {
                    waitUntil: waitFor as any,
                    timeout: 30000
                });
            }
            
            // Optional delay
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Prepare screenshot options
            const screenshotOptions: any = {
                encoding: 'base64',
                fullPage,
                type: format
            };
            
            // Add quality option for jpeg and webp
            if ((format === 'jpeg' || format === 'webp') && quality !== undefined) {
                screenshotOptions.quality = quality;
            }
            
            // Take screenshot
            const screenshot = await page.screenshot(screenshotOptions) as string;
            
            // Get page title and final URL for context
            const pageTitle = await page.title();
            const finalUrl = page.url();
            
            // If using a new page, save any new cookies
            if (!reuseAuthPage && useSavedAuth) {
                const currentCookies = await page.cookies();
                if (currentCookies.length > 0) {
                    await saveCookies(url, currentCookies);
                }
            }
            
            // Determine browser type for response
            const browserType = useDefaultBrowser && visibleBrowser ? 'default browser' : 'Puppeteer browser';
            const browserMode = visibleBrowser ? 'visible' : 'headless';
            
            return {
                content: [
                    {
                        type: "text",
                        text: `Screenshot captured successfully!\n\nBrowser: ${browserType} (${browserMode})\nPage Title: ${pageTitle}\nFinal URL: ${finalUrl}\nFormat: ${format}\nDimensions: ${width}x${height}\nFull Page: ${fullPage}\nUsed saved auth: ${useSavedAuth}\nReused auth page: ${reuseAuthPage}`
                    },
                    {
                        type: "image",
                        data: screenshot,
                        mimeType: `image/${format}`
                    }
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error capturing screenshot: ${errorMessage}`,
                    },
                ],
            };
        } finally {
            // Only close the page if it's not the persistent one or if we should close it
            if (page && shouldClosePage && page !== persistentPage) {
                await page.close().catch(() => {});
            }
        }
    }
);

// Tool to signal login completion
server.tool(
    "signal-login-complete",
    "Signals that manual login is complete and the login-and-wait tool should continue",
    {},
    async () => {
        try {
            const completionFile = path.join(os.tmpdir(), 'mcp-login-complete.txt');
            await fsPromises.writeFile(completionFile, 'complete');
            
            return {
                content: [
                    {
                        type: "text",
                        text: "Login completion signal sent! The login-and-wait tool should continue shortly."
                    }
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error signaling login completion: ${errorMessage}`,
                    },
                ],
            };
        }
    }
);

// Tool to clear saved cookies
server.tool(
    "clear-auth-cookies",
    "Clears saved authentication cookies for a specific domain or all domains",
    {
        url: z.string().url().optional().describe("URL of the domain to clear cookies for. If not provided, clears all cookies."),
    },
    async ({ url }) => {
        try {
            await ensureCookiesDir();
            
            if (url) {
                // Clear cookies for specific domain
                const domain = getDomainFromUrl(url);
                const cookiesPath = path.join(cookiesDir, `${domain}.json`);
                try {
                    await fsPromises.unlink(cookiesPath);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Cookies cleared for domain: ${domain}`
                            }
                        ],
                    };
                } catch {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No cookies found for domain: ${domain}`
                            }
                        ],
                    };
                }
            } else {
                // Clear all cookies
                const files = await fsPromises.readdir(cookiesDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        await fsPromises.unlink(path.join(cookiesDir, file));
                    }
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: `All saved cookies cleared (${files.length} domains)`
                        }
                    ],
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error clearing cookies: ${errorMessage}`,
                    },
                ],
            };
        }
    }
);

// Keep the screenshot-element tool as before, but add default browser support
server.tool(
    "screenshot-element",
    "Captures a screenshot of a specific element on a webpage using a CSS selector",
    {
        url: z.string().url().describe("The URL of the webpage"),
        selector: z.string().describe("CSS selector for the element to screenshot"),
        waitForSelector: z.boolean().optional().default(true).describe("Whether to wait for the selector to appear"),
        format: z.enum(['png', 'jpeg', 'webp']).optional().default('png').describe("Image format for the screenshot"),
        quality: z.number().min(0).max(100).optional().describe("Quality of the image (0-100), only applicable for jpeg and webp"),
        padding: z.number().optional().default(0).describe("Padding around the element in pixels"),
        useSavedAuth: z.boolean().optional().default(true).describe("Whether to use saved cookies from previous login"),
        useDefaultBrowser: z.boolean().optional().default(false).describe("Whether to use the system's default browser instead of Puppeteer's bundled Chromium"),
        visibleBrowser: z.boolean().optional().default(false).describe("Whether to show the browser window (non-headless mode)")
    },
    async ({ url, selector, waitForSelector, format, quality, padding, useSavedAuth, useDefaultBrowser, visibleBrowser }) => {
        let page: Page | null = null;
        
        try {
            // Initialize browser with appropriate options
            const isHeadless = !visibleBrowser;
            const browserInstance = await initBrowser(isHeadless, useDefaultBrowser && visibleBrowser);
            
            // Create a new page
            page = await browserInstance.newPage();
            
            // Load saved cookies if requested
            if (useSavedAuth) {
                const cookies = await loadCookies(url);
                if (cookies.length > 0) {
                    await page.setCookie(...cookies);
                }
            }
            
            // Set viewport (matching screenshot-page tool)
            await page.setViewport({ width: 1920, height: 1080 });
            
            // Set user agent to avoid bot detection
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Additional anti-detection measures for Google
            await page.evaluateOnNewDocument(() => {
                // Remove webdriver property
                delete (window.navigator as any).webdriver;
                
                // Override the plugins property to add fake plugins
                Object.defineProperty(window.navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                
                // Override the languages property
                Object.defineProperty(window.navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
                
                // Override permissions
                Object.defineProperty(window.navigator, 'permissions', {
                    get: () => ({
                        query: () => Promise.resolve({ state: 'granted' })
                    })
                });
            });
            
            // Navigate to the URL
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            // Wait for the selector if requested
            if (waitForSelector) {
                await page.waitForSelector(selector, { timeout: 10000 });
            }
            
            // Get the element
            const element = await page.$(selector);
            
            if (!element) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Element not found with selector: ${selector}`,
                        },
                    ],
                };
            }
            
            // Add padding if requested
            if (padding > 0) {
                await page.evaluate((sel, pad) => {
                    const el = document.querySelector(sel);
                    if (el) {
                        (el as HTMLElement).style.padding = `${pad}px`;
                    }
                }, selector, padding);
            }
            
            // Prepare screenshot options
            const screenshotOptions: any = {
                encoding: 'base64',
                type: format
            };
            
            // Add quality option for jpeg and webp
            if ((format === 'jpeg' || format === 'webp') && quality !== undefined) {
                screenshotOptions.quality = quality;
            }
            
            // Take screenshot of the element
            const screenshot = await element.screenshot(screenshotOptions) as string;
            
            // Determine browser type for response
            const browserType = useDefaultBrowser && visibleBrowser ? 'default browser' : 'Puppeteer browser';
            const browserMode = visibleBrowser ? 'visible' : 'headless';
            
            return {
                content: [
                    {
                        type: "text",
                        text: `Element screenshot captured successfully!\n\nBrowser: ${browserType} (${browserMode})\nURL: ${url}\nSelector: ${selector}\nFormat: ${format}`
                    },
                    {
                        type: "image",
                        data: screenshot,
                        mimeType: `image/${format}`
                    }
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Error capturing element screenshot: ${errorMessage}`,
                    },
                ],
            };
        } finally {
            // Close the page
            if (page) {
                await page.close().catch(() => {});
            }
        }
    }
);

// Run the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Screenshot MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});