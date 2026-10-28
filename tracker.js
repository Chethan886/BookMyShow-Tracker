/**
 * BookMyShow Movie Ticket Availability Tracker for Karwar
 * 
 * Automates detection of movie release and booking availability (e.g. "Ramayana")
 * in BookMyShow Karwar, dispatching instant rich Discord webhook alerts.
 * Designed for serverless scheduled runs on GitHub Actions.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// ==========================================
// CONFIGURATION & ENVIRONMENT VARIABLES
// ==========================================

const CONFIG = {
  // Target Region (BookMyShow slug)
  region: (process.env.BMS_REGION || 'karwar').toLowerCase().trim(),

  // Target Movie Search Keywords & Regex
  // Matches "Ramayana", "Ramayana: Part 1", "Ramayana - Part 1", "Ramayan Part 1", etc.
  targetKeywords: (process.env.TARGET_KEYWORDS || 'Ramayana,Ramayana: Part 1,Ramayana - Part 1')
    .split(',')
    .map(kw => kw.trim().toLowerCase())
    .filter(Boolean),
  targetRegex: /\b(ramayana(:?\s*part\s*1|-?\s*part\s*1)?|ramayan)\b/i,

  // Discord Webhook configuration
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  discordMention: process.env.DISCORD_MENTION !== undefined ? process.env.DISCORD_MENTION : '@everyone',

  // State Persistence File Path
  stateFile: path.resolve(__dirname, process.env.STATE_FILE || 'state.json'),

  // Execution Flags
  forceAlert: process.env.FORCE_ALERT === 'true',
  testMode: process.argv.includes('--test') || process.env.TEST_ALERT === 'true',

  // Network & Request Options
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '2500', 10),
};

// Target URLs for BookMyShow Karwar
const URLS = {
  regionHome: `https://in.bookmyshow.com/explore/movies-${CONFIG.region}`,
  regionMovies: `https://in.bookmyshow.com/${CONFIG.region}/movies`,
  regionUpcoming: `https://in.bookmyshow.com/explore/upcoming-movies-${CONFIG.region}`,
  quickBookApi: `https://in.bookmyshow.com/serv/getData?cmd=QUICKBOOK&type=MT&f=json`,
};

// Known Karwar Cinema (for fallback display if not dynamically parsed)
const DEFAULT_KARWAR_CINEMA = 'Miraj Cinemas: Geetanjali, Karwar';

// ==========================================
// HTTP CLIENT SETUP (Browser Emulation)
// ==========================================

const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8,kn;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://in.bookmyshow.com/',
  'Cookie': `RgnCode=${CONFIG.region.toUpperCase()}; bmsId=1.${Date.now()}.${Math.floor(Math.random() * 1000000)};`,
};

const httpClient = axios.create({
  timeout: CONFIG.timeoutMs,
  headers: browserHeaders,
  validateStatus: status => status >= 200 && status < 400,
});

/**
 * Sleep helper for backoff delays
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust fetch wrapper with exponential backoff retries
 */
async function fetchWithRetry(url, options = {}, retries = CONFIG.maxRetries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[HTTP] GET ${url} (Attempt ${attempt}/${retries})`);
      const response = await httpClient.get(url, options);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const status = error.response ? error.response.status : error.code || 'UNKNOWN';
      console.warn(`[HTTP] Error fetching ${url} [Status: ${status}] on attempt ${attempt}`);

      if (isLastAttempt) {
        throw error;
      }

      const backoff = CONFIG.retryDelayMs * Math.pow(1.5, attempt - 1);
      console.log(`[HTTP] Retrying in ${(backoff / 1000).toFixed(1)}s...`);
      await sleep(backoff);
    }
  }
}

// ==========================================
// STATE MANAGEMENT (state.json)
// ==========================================

function loadState() {
  const defaultState = {
    alertSent: false,
    lastCheckTime: null,
    lastStatus: 'NOT_RUN_YET',
    detectedTitle: null,
    bookingUrl: null,
    theaters: [],
    lastAlertSentTime: null,
  };

  if (!fs.existsSync(CONFIG.stateFile)) {
    saveState(defaultState);
    return defaultState;
  }

  try {
    const raw = fs.readFileSync(CONFIG.stateFile, 'utf8');
    return { ...defaultState, ...JSON.parse(raw) };
  } catch (error) {
    console.warn(`[STATE] Failed to read state file, using defaults:`, error.message);
    return defaultState;
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), 'utf8');
    console.log(`[STATE] Saved state to ${path.basename(CONFIG.stateFile)}`);
  } catch (error) {
    console.error(`[STATE] Failed to write state file:`, error.message);
  }
}

// ==========================================
// DETECTION & SCRAPING STRATEGIES
// ==========================================

/**
 * Check if a given string matches the target movie criteria
 */
function isTitleMatch(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (CONFIG.targetRegex.test(clean)) return true;
  const lower = clean.toLowerCase();
  return CONFIG.targetKeywords.some(kw => lower.includes(kw));
}

/**
 * Recursively search any nested JavaScript object for target movie occurrences
 */
function searchNextDataForMovie(obj, matches = []) {
  if (!obj || typeof obj !== 'object') return matches;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      searchNextDataForMovie(item, matches);
    }
    return matches;
  }

  // Check candidate movie/event object
  const title = obj.EventTitle || obj.eventTitle || obj.title || obj.name || obj.EventName;
  const code = obj.EventCode || obj.eventCode || obj.code;
  const url = obj.EventURL || obj.eventURL || obj.seoUrl || obj.slug || obj.url;

  if (title && isTitleMatch(title)) {
    // Check if live/bookable indicators exist
    const isBookable = Boolean(
      obj.isBookable ||
      obj.isEventLive ||
      obj.hasShowtimes ||
      (obj.arrShowTimes && obj.arrShowTimes.length > 0) ||
      (obj.shows && obj.shows.length > 0) ||
      (url && (url.includes('/buytickets/') || url.includes('/booking/'))) ||
      obj.bookingUrl
    );

    let bookingUrl = obj.bookingUrl || (url ? (url.startsWith('http') ? url : `https://in.bookmyshow.com${url}`) : null);

    matches.push({
      title: String(title).trim(),
      code: code ? String(code).trim() : null,
      bookingUrl,
      isBookable,
      raw: {
        languages: obj.languages || obj.language,
        dimension: obj.dimension || obj.format,
        releaseDate: obj.releaseDate || obj.eventDate,
      },
    });
  }

  // Recurse into object properties
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      searchNextDataForMovie(obj[key], matches);
    }
  }

  return matches;
}

/**
 * Strategy 1: Parse Next.js Hydration Data (__NEXT_DATA__)
 * BMS uses Next.js; its SSR payload contains structured event catalogs
 */
function parseNextData(html) {
  try {
    const $ = cheerio.load(html);
    const scriptTag = $('script#__NEXT_DATA__').html();
    if (!scriptTag) return null;

    const nextData = JSON.parse(scriptTag);
    const matches = searchNextDataForMovie(nextData);

    if (matches && matches.length > 0) {
      console.log(`[PARSE:NEXT_DATA] Found ${matches.length} matching candidate(s) in __NEXT_DATA__`);
      return matches;
    }
  } catch (error) {
    console.warn(`[PARSE:NEXT_DATA] Failed to parse __NEXT_DATA__:`, error.message);
  }
  return null;
}

/**
 * Strategy 2: Cheerio DOM Parsing
 * Direct DOM inspection for anchor tags, movie cards, and booking triggers
 */
function parseDomForMovie(html, pageUrl) {
  const matches = [];
  try {
    const $ = cheerio.load(html);

    // Look for all anchor tags with movie links or titles
    $('a').each((_, elem) => {
      const text = $(elem).text().trim();
      const href = $(elem).attr('href') || '';
      const ariaLabel = $(elem).attr('aria-label') || '';

      const matchedText = isTitleMatch(text) ? text : (isTitleMatch(ariaLabel) ? ariaLabel : (isTitleMatch(href) ? href : null));

      if (matchedText) {
        // Resolve URL
        let fullUrl = href;
        if (href && !href.startsWith('http')) {
          fullUrl = `https://in.bookmyshow.com${href.startsWith('/') ? '' : '/'}${href}`;
        }

        // Check if bookable or if parents/siblings indicate "Book" or "Advance Booking"
        const parentHtml = $(elem).closest('div, section, article').text();
        const hasBookBtn =
          /book\s*tickets?|buy\s*tickets?|advance\s*booking|\/buytickets\//i.test(parentHtml) ||
          /buytickets/i.test(fullUrl);

        matches.push({
          title: text || matchedText,
          bookingUrl: fullUrl || pageUrl,
          isBookable: hasBookBtn,
          source: 'DOM',
        });
      }
    });

    // Also scan for any movie card text containing the target title
    if (matches.length === 0) {
      $('div, h2, h3, h4, span, p').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 2 && text.length < 80 && isTitleMatch(text)) {
          const parent = $(elem).closest('div');
          const hasBookBtn = /book\s*tickets?|buy\s*tickets?|advance\s*booking/i.test(parent.text());
          const link = parent.find('a[href]').attr('href');
          let resolvedLink = pageUrl;
          if (link) {
            resolvedLink = link.startsWith('http') ? link : `https://in.bookmyshow.com${link.startsWith('/') ? '' : '/'}${link}`;
          }

          matches.push({
            title: text,
            bookingUrl: resolvedLink,
            isBookable: hasBookBtn,
            source: 'DOM_CARD',
          });
        }
      });
    }
  } catch (error) {
    console.warn(`[PARSE:DOM] Error during DOM parsing:`, error.message);
  }

  return matches;
}

/**
 * Strategy 3: Check BMS Legacy QuickBook API
 */
async function checkQuickBookApi() {
  try {
    console.log(`[STRATEGY:API] Checking BMS QuickBook catalog API...`);
    const res = await httpClient.get(URLS.quickBookApi, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': URLS.regionHome,
      },
    });

    if (res.data && typeof res.data === 'object') {
      const dataStr = JSON.stringify(res.data);
      if (CONFIG.targetRegex.test(dataStr)) {
        console.log(`[STRATEGY:API] Target movie matched in QuickBook data!`);
        // Extract events if present
        const events = res.data.arrEvents || res.data.BookMyShow?.arrEvents || [];
        for (const ev of events) {
          const evName = ev.EventTitle || ev.EventName || '';
          if (isTitleMatch(evName)) {
            return {
              title: evName,
              bookingUrl: URLS.regionHome,
              isBookable: true,
              source: 'QUICKBOOK_API',
            };
          }
        }
        return {
          title: 'Ramayana',
          bookingUrl: URLS.regionHome,
          isBookable: true,
          source: 'QUICKBOOK_API',
        };
      }
    }
  } catch (error) {
    console.log(`[STRATEGY:API] QuickBook API returned non-fatal error:`, error.message);
  }
  return null;
}

/**
 * Master check function that runs all detection layers
 */
async function checkMovieAvailability() {
  const result = {
    isFound: false,
    isLive: false,
    movieTitle: 'Ramayana',
    bookingUrl: URLS.regionHome,
    theaters: [DEFAULT_KARWAR_CINEMA],
    strategyUsed: 'NONE',
  };

  const pagesToCheck = [
    { url: URLS.regionHome, name: 'Karwar Explore Movies' },
    { url: URLS.regionMovies, name: 'Karwar Movies Landing' },
    { url: URLS.regionUpcoming, name: 'Karwar Upcoming Movies' },
  ];

  for (const page of pagesToCheck) {
    try {
      console.log(`\n--- Inspecting: ${page.name} (${page.url}) ---`);
      const response = await fetchWithRetry(page.url);
      const html = response.data;

      // Layer 1: Next.js JSON Extraction
      const nextDataMatches = parseNextData(html);
      if (nextDataMatches && nextDataMatches.length > 0) {
        result.isFound = true;
        result.strategyUsed = 'NEXT_DATA';

        // Select the most live match or first match
        const liveMatch = nextDataMatches.find(m => m.isBookable) || nextDataMatches[0];
        result.movieTitle = liveMatch.title || result.movieTitle;
        if (liveMatch.bookingUrl) result.bookingUrl = liveMatch.bookingUrl;
        result.isLive = Boolean(liveMatch.isBookable);

        console.log(`[DETECTION] Match found in ${page.name}: "${result.movieTitle}" | Live: ${result.isLive}`);
        if (result.isLive) {
          return result; // Early return if confirmed live
        }
      }

      // Layer 2: Cheerio DOM Parsing
      const domMatches = parseDomForMovie(html, page.url);
      if (domMatches && domMatches.length > 0) {
        result.isFound = true;
        result.strategyUsed = result.strategyUsed === 'NEXT_DATA' ? 'NEXT_DATA+DOM' : 'DOM';

        const liveMatch = domMatches.find(m => m.isBookable) || domMatches[0];
        result.movieTitle = liveMatch.title || result.movieTitle;
        if (liveMatch.bookingUrl) result.bookingUrl = liveMatch.bookingUrl;
        if (liveMatch.isBookable) result.isLive = true;

        console.log(`[DETECTION] DOM Match in ${page.name}: "${result.movieTitle}" | Live: ${result.isLive}`);
        if (result.isLive) {
          return result; // Early return if confirmed live
        }
      }
    } catch (pageError) {
      console.warn(`[CHECK] Could not inspect ${page.name}:`, pageError.message);
      // Soft failure: continue checking subsequent pages
    }
  }

  // Layer 3: Fallback QuickBook API
  const apiMatch = await checkQuickBookApi();
  if (apiMatch) {
    result.isFound = true;
    result.isLive = true;
    result.movieTitle = apiMatch.title || result.movieTitle;
    result.bookingUrl = apiMatch.bookingUrl || result.bookingUrl;
    result.strategyUsed = 'QUICKBOOK_API';
  }

  return result;
}

// ==========================================
// DISCORD WEBHOOK ALERT
// ==========================================

async function sendDiscordWebhook(payload) {
  if (!CONFIG.discordWebhookUrl) {
    console.error(`[DISCORD] Error: DISCORD_WEBHOOK_URL is not configured! Cannot send alert.`);
    return false;
  }

  try {
    const res = await axios.post(CONFIG.discordWebhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log(`[DISCORD] Webhook dispatched successfully (HTTP ${res.status})`);
    return true;
  } catch (error) {
    const status = error.response ? error.response.status : error.code;
    const body = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[DISCORD] Failed to send webhook [${status}]: ${body}`);
    return false;
  }
}

/**
 * Dispatch rich ticket alert embed
 */
async function sendTicketsLiveAlert(details) {
  const mentionText = CONFIG.discordMention && CONFIG.discordMention.toLowerCase() !== 'none'
    ? `${CONFIG.discordMention} `
    : '';

  const embed = {
    title: `🚨 TICKETS ARE LIVE: ${details.movieTitle}!`,
    description: `Bookings have opened or showtimes have been listed on **BookMyShow Karwar** for **${details.movieTitle}**!\n\nGrab your seats before shows fill up!`,
    url: details.bookingUrl || URLS.regionHome,
    // BMS Vibrant Coral/Red Hex Color (#F84464 -> 16270436)
    color: 16270436,
    fields: [
      {
        name: '🎬 Movie Title',
        value: `**${details.movieTitle}**`,
        inline: true,
      },
      {
        name: '📍 Region / City',
        value: `**Karwar, Karnataka**`,
        inline: true,
      },
      {
        name: '🏛️ Cinema(s)',
        value: details.theaters && details.theaters.length > 0
          ? details.theaters.join('\n')
          : DEFAULT_KARWAR_CINEMA,
        inline: false,
      },
      {
        name: '🎟️ Booking Status',
        value: '🟢 **TICKETS LIVE / ADVANCE BOOKING OPEN**',
        inline: true,
      },
      {
        name: '⚡ Detection Method',
        value: `\`${details.strategyUsed || 'Automated Scraper'}\``,
        inline: true,
      },
      {
        name: '🔗 Direct Booking Link',
        value: `[👉 Click here to Book on BookMyShow Karwar](${details.bookingUrl || URLS.regionHome})`,
        inline: false,
      },
    ],
    thumbnail: {
      url: 'https://in.bmscdn.com/webin/common/icons/bms.png',
    },
    footer: {
      text: 'BookMyShow Karwar Tracker • Instant Serverless Alert',
      icon_url: 'https://assets-in.bmscdn.com/webin/common/favicon.ico',
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: `${mentionText}🚨 **TICKETS ARE LIVE IN KARWAR for ${details.movieTitle}!**`,
    embeds: [embed],
  };

  return await sendDiscordWebhook(payload);
}

/**
 * Dispatch test alert to verify Discord webhook connectivity
 */
async function sendTestAlert() {
  console.log(`[TEST] Dispatching verification alert to Discord webhook...`);
  const mentionText = CONFIG.discordMention && CONFIG.discordMention.toLowerCase() !== 'none'
    ? `${CONFIG.discordMention} `
    : '';

  const embed = {
    title: `🧪 Test Alert: BookMyShow Karwar Tracker Connected!`,
    description: `Your Discord Webhook and GitHub Actions alert pipeline is **fully working**! When tickets for **Ramayana** open in Karwar, you will receive an instant notification here.`,
    url: URLS.regionHome,
    // Discord Blurple / Emerald Green (0x57F287 -> 5763719)
    color: 5763719,
    fields: [
      {
        name: '📍 Target Region',
        value: `**Karwar** (\`${CONFIG.region}\`)`,
        inline: true,
      },
      {
        name: '🎯 Target Event',
        value: `**Ramayana** (including Part 1 variations)`,
        inline: true,
      },
      {
        name: '🏛️ Monitored Theater',
        value: DEFAULT_KARWAR_CINEMA,
        inline: true,
      },
      {
        name: '🔔 Mention Level',
        value: `\`${CONFIG.discordMention}\``,
        inline: true,
      },
      {
        name: '🔗 Monitored URL',
        value: `[BookMyShow Karwar Movies Page](${URLS.regionHome})`,
        inline: false,
      },
    ],
    footer: {
      text: 'BookMyShow Karwar Tracker • Test Mode Successful',
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: `${mentionText}✅ **BookMyShow Karwar Tracker Test Notification**`,
    embeds: [embed],
  };

  const success = await sendDiscordWebhook(payload);
  if (success) {
    console.log(`[TEST] ✅ Verification test passed! Check your Discord channel.`);
  } else {
    console.error(`[TEST] ❌ Test failed. Please check your DISCORD_WEBHOOK_URL.`);
  }
  return success;
}

// ==========================================
// MAIN EXECUTION FLOW
// ==========================================

async function main() {
  console.log(`=======================================================`);
  console.log(`🎬 BookMyShow Karwar Ticket Tracker`);
  console.log(`📍 Region: ${CONFIG.region.toUpperCase()}`);
  console.log(`🎯 Target: Ramayana (Regex: ${CONFIG.targetRegex})`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  console.log(`=======================================================`);

  // Handle explicit Test Mode
  if (CONFIG.testMode) {
    console.log(`[MODE] Test Mode Active.`);
    if (!CONFIG.discordWebhookUrl) {
      console.error(`[ERROR] DISCORD_WEBHOOK_URL is not defined in environment variables!`);
      process.exit(1);
    }
    const success = await sendTestAlert();
    process.exit(success ? 0 : 1);
  }

  // Load persistent state
  const state = loadState();
  console.log(`[STATE] Previous Status: ${state.lastStatus} | Alert Already Sent: ${state.alertSent}`);

  // Run detection
  let detectionResult;
  try {
    detectionResult = await checkMovieAvailability();
  } catch (error) {
    console.error(`[CHECK] Unexpected error running tracker:`, error.message);
    // Soft failure so GitHub Action cron doesn't generate noisy red email alerts
    console.log(`[EXIT] Soft failure recorded. Exiting cleanly for next scheduled cycle.`);
    process.exit(0);
  }

  console.log(`\n================== RESULTS ==================`);
  console.log(`Movie Detected: ${detectionResult.isFound}`);
  console.log(`Live/Bookable:  ${detectionResult.isLive}`);
  console.log(`Title:          ${detectionResult.movieTitle}`);
  console.log(`Booking URL:    ${detectionResult.bookingUrl}`);
  console.log(`Strategy:       ${detectionResult.strategyUsed}`);
  console.log(`=============================================\n`);

  const nowIso = new Date().toISOString();
  state.lastCheckTime = nowIso;
  state.detectedTitle = detectionResult.movieTitle;
  state.bookingUrl = detectionResult.bookingUrl;
  state.theaters = detectionResult.theaters;

  // Handle detection states
  if (detectionResult.isLive) {
    state.lastStatus = 'LIVE';

    if (state.alertSent && !CONFIG.forceAlert) {
      console.log(`[ALERT] Tickets are LIVE, but alert was ALREADY sent at ${state.lastAlertSentTime}.`);
      console.log(`[ALERT] Skipping duplicate Discord webhook dispatch.`);
    } else {
      console.log(`[ALERT] 🚨 NEW LIVE BOOKING DETECTED! Sending Discord alert now...`);
      const sent = await sendTicketsLiveAlert(detectionResult);
      if (sent) {
        state.alertSent = true;
        state.lastAlertSentTime = nowIso;
        console.log(`[ALERT] ✅ Alert sent and state marked as alertSent = true.`);
      } else {
        console.warn(`[ALERT] ⚠️ Alert failed to send. State will allow retry on next run.`);
      }
    }
  } else if (detectionResult.isFound) {
    state.lastStatus = 'LISTED_COMING_SOON';
    console.log(`[STATUS] Movie is listed on BMS Karwar, but booking is not yet live/available.`);
  } else {
    state.lastStatus = 'NOT_YET_LISTED';
    console.log(`[STATUS] Ramayana is not yet listed on BMS Karwar.`);
  }

  // Persist updated state
  saveState(state);

  console.log(`[DONE] Tracker run finished successfully.`);
}

// Execute and handle uncaught rejections cleanly
main().catch(err => {
  console.error(`[FATAL] Unhandled fatal error:`, err);
  // Exit code 0 for soft failures in cron, or 1 if test mode
  process.exit(CONFIG.testMode ? 1 : 0);
});

