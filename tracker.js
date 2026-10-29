/**
 * BookMyShow Movie Ticket Availability Tracker for Karwar
 * 
 * Automates detection of movie release and booking availability
 * for multiple tracked movies (e.g. "Ramayana", "Kantara", etc.)
 * in BookMyShow Karwar, dispatching instant rich Discord webhook alerts.
 * Designed for serverless scheduled runs on GitHub Actions and Next.js / Vercel.
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

  // Default fallback movie keywords if state is empty
  defaultKeywords: (process.env.TARGET_KEYWORDS || 'Ramayana,Ramayana: Part 1,Ramayana - Part 1')
    .split(',')
    .map(kw => kw.trim().toLowerCase())
    .filter(Boolean),
  defaultRegex: /\b(ramayana(:?\s*part\s*1|-?\s*part\s*1)?|ramayan)\b/i,

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

// Default baseline movie
const DEFAULT_RAMAYANA_MOVIE = {
  id: 'ramayana',
  title: 'Ramayana',
  keywords: ['Ramayana', 'Ramayana: Part 1', 'Ramayana - Part 1', 'Ramayan'],
  alertSent: false,
  lastCheckTime: null,
  lastStatus: 'NOT_YET_LISTED',
  detectedTitle: null,
  bookingUrl: URLS.regionHome,
  theaters: [DEFAULT_KARWAR_CINEMA],
  lastAlertSentTime: null,
};

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

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

/**
 * Loads persistent state with automatic migration from single-movie to multi-movie schema
 */
function loadState() {
  const defaultState = {
    movies: [ { ...DEFAULT_RAMAYANA_MOVIE } ],
    settings: {
      region: CONFIG.region,
      discordMention: CONFIG.discordMention,
    },
    // Top-level legacy aliases for backward compatibility
    alertSent: false,
    lastCheckTime: null,
    lastStatus: 'NOT_RUN_YET',
    detectedTitle: null,
    bookingUrl: null,
    theaters: [DEFAULT_KARWAR_CINEMA],
    lastAlertSentTime: null,
  };

  if (!fs.existsSync(CONFIG.stateFile)) {
    saveState(defaultState);
    return defaultState;
  }

  try {
    const raw = fs.readFileSync(CONFIG.stateFile, 'utf8');
    const parsed = JSON.parse(raw);

    // Migration logic: if old state format (lacking movies array)
    if (!parsed.movies || !Array.isArray(parsed.movies)) {
      const migrated = {
        ...DEFAULT_RAMAYANA_MOVIE,
        alertSent: Boolean(parsed.alertSent),
        lastCheckTime: parsed.lastCheckTime || null,
        lastStatus: parsed.lastStatus || 'NOT_YET_LISTED',
        detectedTitle: parsed.detectedTitle || null,
        bookingUrl: parsed.bookingUrl || URLS.regionHome,
        theaters: parsed.theaters && parsed.theaters.length ? parsed.theaters : [DEFAULT_KARWAR_CINEMA],
        lastAlertSentTime: parsed.lastAlertSentTime || null,
      };
      parsed.movies = [migrated];
    }

    if (!parsed.movies.length) {
      parsed.movies = [ { ...DEFAULT_RAMAYANA_MOVIE } ];
    }

    // Mirror first movie to top-level for legacy consumers
    const primary = parsed.movies[0];
    return {
      ...defaultState,
      ...parsed,
      alertSent: primary.alertSent,
      lastCheckTime: primary.lastCheckTime,
      lastStatus: primary.lastStatus,
      detectedTitle: primary.detectedTitle,
      bookingUrl: primary.bookingUrl,
      theaters: primary.theaters,
      lastAlertSentTime: primary.lastAlertSentTime,
    };
  } catch (error) {
    console.warn(`[STATE] Failed to read state file, using defaults:`, error.message);
    return defaultState;
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), 'utf8');
    console.log(`[STATE] Saved state to ${path.basename(CONFIG.stateFile)} (${state.movies ? state.movies.length : 1} movies)`);
  } catch (error) {
    console.error(`[STATE] Failed to write state file:`, error.message);
  }
}

/**
 * Add or update a movie in state.json
 */
function addMovieToState(movieInput) {
  const state = loadState();
  const title = (movieInput.title || '').trim();
  if (!title) {
    throw new Error('Movie title cannot be empty.');
  }

  const id = slugify(movieInput.id || title);

  let keywords = [];
  if (Array.isArray(movieInput.keywords)) {
    keywords = movieInput.keywords.map(k => String(k).trim()).filter(Boolean);
  } else if (typeof movieInput.keywords === 'string') {
    keywords = movieInput.keywords.split(',').map(k => k.trim()).filter(Boolean);
  }
  if (!keywords.some(k => k.toLowerCase() === title.toLowerCase())) {
    keywords.unshift(title);
  }

  const existingIdx = state.movies.findIndex(m => m.id === id || m.title.toLowerCase() === title.toLowerCase());

  const movieEntry = {
    id,
    title,
    keywords,
    alertSent: false,
    lastCheckTime: null,
    lastStatus: 'NOT_YET_LISTED',
    detectedTitle: null,
    bookingUrl: URLS.regionHome,
    theaters: [DEFAULT_KARWAR_CINEMA],
    lastAlertSentTime: null,
    addedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    state.movies[existingIdx] = { ...state.movies[existingIdx], ...movieEntry };
  } else {
    state.movies.push(movieEntry);
  }

  saveState(state);
  return { state, movie: movieEntry };
}

/**
 * Remove a movie from state.json
 */
function removeMovieFromState(movieId) {
  const state = loadState();
  const idToRemove = slugify(movieId);
  const beforeCount = state.movies.length;
  state.movies = state.movies.filter(m => m.id !== idToRemove);

  // Keep at least 1 movie in state
  if (state.movies.length === 0) {
    state.movies = [ { ...DEFAULT_RAMAYANA_MOVIE } ];
  }

  saveState(state);
  return { state, removed: beforeCount > state.movies.length };
}

// ==========================================
// MATCHER & DETECTION STRATEGIES
// ==========================================

/**
 * Creates regex and keyword sets for any movie object
 */
function getMovieMatcher(movieInput) {
  if (!movieInput) {
    return {
      id: 'ramayana',
      title: 'Ramayana',
      keywords: CONFIG.defaultKeywords,
      regex: CONFIG.defaultRegex,
    };
  }

  const title = movieInput.title || 'Ramayana';
  const id = movieInput.id || slugify(title);

  let keywords = [];
  if (Array.isArray(movieInput.keywords)) {
    keywords = movieInput.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean);
  } else if (typeof movieInput.keywords === 'string') {
    keywords = movieInput.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  }

  if (!keywords.includes(title.toLowerCase())) {
    keywords.unshift(title.toLowerCase());
  }

  let regex;
  if (title.toLowerCase() === 'ramayana') {
    regex = CONFIG.defaultRegex;
  } else if (movieInput.regex instanceof RegExp) {
    regex = movieInput.regex;
  } else {
    // Generate clean word-boundary regex escaping special characters
    const escapedTerms = keywords.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    regex = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'i');
  }

  return { id, title, keywords, regex };
}

/**
 * Check if a text matches a specific movie's matcher
 */
function isTitleMatch(text, matcher) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  const m = matcher || { regex: CONFIG.defaultRegex, keywords: CONFIG.defaultKeywords };
  if (m.regex && m.regex.test(clean)) return true;
  const lower = clean.toLowerCase();
  return m.keywords.some(kw => lower.includes(kw));
}

/**
 * Recursively search any nested JavaScript object for target movie occurrences
 */
function searchNextDataForMovie(obj, matcher, matches = []) {
  if (!obj || typeof obj !== 'object') return matches;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      searchNextDataForMovie(item, matcher, matches);
    }
    return matches;
  }

  const title = obj.EventTitle || obj.eventTitle || obj.title || obj.name || obj.EventName;
  const code = obj.EventCode || obj.eventCode || obj.code;
  const url = obj.EventURL || obj.eventURL || obj.seoUrl || obj.slug || obj.url;

  if (title && isTitleMatch(title, matcher)) {
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

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      searchNextDataForMovie(obj[key], matcher, matches);
    }
  }

  return matches;
}

/**
 * Strategy 1: Parse Next.js Hydration Data (__NEXT_DATA__)
 */
function parseNextData(html, matcher) {
  try {
    const $ = cheerio.load(html);
    const scriptTag = $('script#__NEXT_DATA__').html();
    if (!scriptTag) return null;

    const nextData = JSON.parse(scriptTag);
    const matches = searchNextDataForMovie(nextData, matcher);

    if (matches && matches.length > 0) {
      console.log(`[PARSE:NEXT_DATA] Found ${matches.length} candidate(s) for "${matcher.title}" in __NEXT_DATA__`);
      return matches;
    }
  } catch (error) {
    console.warn(`[PARSE:NEXT_DATA] Failed to parse __NEXT_DATA__:`, error.message);
  }
  return null;
}

/**
 * Strategy 2: Cheerio DOM Parsing
 */
function parseDomForMovie(html, pageUrl, matcher) {
  const matches = [];
  try {
    const $ = cheerio.load(html);

    // Look for all anchor tags
    $('a').each((_, elem) => {
      const text = $(elem).text().trim();
      const href = $(elem).attr('href') || '';
      const ariaLabel = $(elem).attr('aria-label') || '';

      const matchedText = isTitleMatch(text, matcher)
        ? text
        : (isTitleMatch(ariaLabel, matcher) ? ariaLabel : (isTitleMatch(href, matcher) ? href : null));

      if (matchedText) {
        let fullUrl = href;
        if (href && !href.startsWith('http')) {
          fullUrl = `https://in.bookmyshow.com${href.startsWith('/') ? '' : '/'}${href}`;
        }

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

    // Also scan for movie cards
    if (matches.length === 0) {
      $('div, h2, h3, h4, span, p').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 2 && text.length < 90 && isTitleMatch(text, matcher)) {
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
 * Strategy 3: Check BMS QuickBook catalog API
 */
function parseQuickBookData(data, matcher) {
  if (!data || typeof data !== 'object') return null;
  try {
    const dataStr = JSON.stringify(data);
    if (matcher.regex.test(dataStr) || matcher.keywords.some(k => dataStr.toLowerCase().includes(k))) {
      const events = data.arrEvents || data.BookMyShow?.arrEvents || [];
      for (const ev of events) {
        const evName = ev.EventTitle || ev.EventName || '';
        if (isTitleMatch(evName, matcher)) {
          return {
            title: evName,
            bookingUrl: URLS.regionHome,
            isBookable: true,
            source: 'QUICKBOOK_API',
          };
        }
      }
      return {
        title: matcher.title,
        bookingUrl: URLS.regionHome,
        isBookable: true,
        source: 'QUICKBOOK_API',
      };
    }
  } catch (error) {
    console.warn(`[PARSE:QUICKBOOK] Error parsing quickbook data:`, error.message);
  }
  return null;
}

// ==========================================
// BATCH FETCHING & DETECTION
// ==========================================

let inMemoryPageCache = {
  timestamp: 0,
  data: null,
};

/**
 * Fetches all Karwar pages once and caches in-memory for 25 seconds
 * Ensures checking 10 movies takes the exact same time and requests as 1 movie
 */
async function fetchKarwarPages(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && inMemoryPageCache.data && now - inMemoryPageCache.timestamp < 25000) {
    return inMemoryPageCache.data;
  }

  const pages = [
    { url: URLS.regionHome, name: 'Karwar Explore Movies' },
    { url: URLS.regionMovies, name: 'Karwar Movies Landing' },
    { url: URLS.regionUpcoming, name: 'Karwar Upcoming Movies' },
  ];

  const fetchedPages = [];
  for (const page of pages) {
    try {
      console.log(`\n--- Fetching: ${page.name} (${page.url}) ---`);
      const res = await fetchWithRetry(page.url);
      fetchedPages.push({ ...page, html: res.data });
    } catch (err) {
      console.warn(`[FETCH] Could not fetch ${page.name}:`, err.message);
      fetchedPages.push({ ...page, html: null, error: err.message });
    }
  }

  let quickBookData = null;
  try {
    console.log(`[HTTP] Checking BMS QuickBook API...`);
    const qbRes = await httpClient.get(URLS.quickBookApi, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': URLS.regionHome,
      },
    });
    quickBookData = qbRes.data;
  } catch (err) {
    console.log(`[HTTP] QuickBook API returned non-fatal error:`, err.message);
  }

  inMemoryPageCache = {
    timestamp: now,
    data: { pages: fetchedPages, quickBookData },
  };

  return inMemoryPageCache.data;
}

/**
 * Check availability for a single movie using cached or fresh pages
 */
async function checkMovieAvailability(movieInput, preloadedData = null) {
  const matcher = getMovieMatcher(movieInput);

  const result = {
    movie: {
      id: matcher.id,
      title: matcher.title,
      keywords: matcher.keywords,
    },
    isFound: false,
    isLive: false,
    movieTitle: matcher.title,
    bookingUrl: URLS.regionHome,
    theaters: [DEFAULT_KARWAR_CINEMA],
    strategyUsed: 'NONE',
  };

  const data = preloadedData || (await fetchKarwarPages());

  for (const page of data.pages) {
    if (!page.html) continue;

    // Layer 1: Next.js JSON Extraction
    const nextMatches = parseNextData(page.html, matcher);
    if (nextMatches && nextMatches.length > 0) {
      result.isFound = true;
      result.strategyUsed = 'NEXT_DATA';

      const liveMatch = nextMatches.find(m => m.isBookable) || nextMatches[0];
      result.movieTitle = liveMatch.title || result.movieTitle;
      if (liveMatch.bookingUrl) result.bookingUrl = liveMatch.bookingUrl;
      result.isLive = Boolean(liveMatch.isBookable);

      console.log(`[DETECTION] Match for "${matcher.title}" in ${page.name}: "${result.movieTitle}" | Live: ${result.isLive}`);
      if (result.isLive) return result;
    }

    // Layer 2: Cheerio DOM Parsing
    const domMatches = parseDomForMovie(page.html, page.url, matcher);
    if (domMatches && domMatches.length > 0) {
      result.isFound = true;
      result.strategyUsed = result.strategyUsed === 'NEXT_DATA' ? 'NEXT_DATA+DOM' : 'DOM';

      const liveMatch = domMatches.find(m => m.isBookable) || domMatches[0];
      result.movieTitle = liveMatch.title || result.movieTitle;
      if (liveMatch.bookingUrl) result.bookingUrl = liveMatch.bookingUrl;
      if (liveMatch.isBookable) result.isLive = true;

      console.log(`[DETECTION] DOM Match for "${matcher.title}" in ${page.name}: "${result.movieTitle}" | Live: ${result.isLive}`);
      if (result.isLive) return result;
    }
  }

  // Layer 3: QuickBook API Fallback
  if (data.quickBookData) {
    const apiMatch = parseQuickBookData(data.quickBookData, matcher);
    if (apiMatch) {
      result.isFound = true;
      result.isLive = true;
      result.movieTitle = apiMatch.title || result.movieTitle;
      result.bookingUrl = apiMatch.bookingUrl || result.bookingUrl;
      result.strategyUsed = 'QUICKBOOK_API';
    }
  }

  return result;
}

/**
 * Check all tracked movies in batch
 */
async function checkAllMovies(moviesList = null, options = {}) {
  const state = loadState();
  const moviesToCheck = moviesList || state.movies || [];

  console.log(`\n=======================================================`);
  console.log(`🎬 Checking ${moviesToCheck.length} Tracked Movie(s) in BookMyShow Karwar`);
  console.log(`=======================================================`);

  // Fetch page contents once for all movies
  const preloaded = await fetchKarwarPages(Boolean(options.forceFresh));
  const results = [];

  const nowIso = new Date().toISOString();

  for (const m of moviesToCheck) {
    const res = await checkMovieAvailability(m, preloaded);
    results.push(res);

    // Find and update movie entry in state
    const movieEntry = state.movies.find(item => item.id === m.id || item.title.toLowerCase() === m.title.toLowerCase());
    if (movieEntry) {
      movieEntry.lastCheckTime = nowIso;
      movieEntry.detectedTitle = res.movieTitle;
      movieEntry.bookingUrl = res.bookingUrl;

      if (res.isLive) {
        movieEntry.lastStatus = 'LIVE';
        if (!movieEntry.alertSent || CONFIG.forceAlert) {
          if (options.sendAlerts !== false) {
            console.log(`[ALERT] 🚨 Live tickets detected for "${movieEntry.title}"! Sending Discord alert...`);
            const sent = await sendTicketsLiveAlert(res);
            if (sent) {
              movieEntry.alertSent = true;
              movieEntry.lastAlertSentTime = nowIso;
            }
          }
        } else {
          console.log(`[ALERT] "${movieEntry.title}" is LIVE, but alert was already sent previously.`);
        }
      } else if (res.isFound) {
        movieEntry.lastStatus = 'LISTED_COMING_SOON';
      } else {
        movieEntry.lastStatus = 'NOT_YET_LISTED';
      }
    }
  }

  // Mirror first movie to top-level for legacy consumers
  if (state.movies[0]) {
    state.alertSent = state.movies[0].alertSent;
    state.lastStatus = state.movies[0].lastStatus;
    state.lastCheckTime = state.movies[0].lastCheckTime;
    state.detectedTitle = state.movies[0].detectedTitle;
    state.bookingUrl = state.movies[0].bookingUrl;
  }

  saveState(state);

  return { results, state };
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
 * Dispatch rich ticket alert embed for a specific movie
 */
async function sendTicketsLiveAlert(details) {
  const title = details.movieTitle || details.movie?.title || 'Tracked Movie';
  const mentionText = CONFIG.discordMention && CONFIG.discordMention.toLowerCase() !== 'none'
    ? `${CONFIG.discordMention} `
    : '';

  const embed = {
    title: `🚨 TICKETS ARE LIVE: ${title}!`,
    description: `Bookings have opened or showtimes have been listed on **BookMyShow Karwar** for **${title}**!\n\nGrab your seats before shows fill up!`,
    url: details.bookingUrl || URLS.regionHome,
    color: 16270436, // BMS Red (#F84464)
    fields: [
      {
        name: '🎬 Movie Title',
        value: `**${title}**`,
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
      text: 'BookMyShow Karwar Tracker • Instant Multi-Movie Alert',
      icon_url: 'https://assets-in.bmscdn.com/webin/common/favicon.ico',
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: `${mentionText}🚨 **TICKETS ARE LIVE IN KARWAR for ${title}!**`,
    embeds: [embed],
  };

  return await sendDiscordWebhook(payload);
}

/**
 * Dispatch test alert to verify Discord webhook connectivity
 */
async function sendTestAlert(movieTitle = 'Ramayana') {
  console.log(`[TEST] Dispatching verification alert to Discord webhook...`);
  const mentionText = CONFIG.discordMention && CONFIG.discordMention.toLowerCase() !== 'none'
    ? `${CONFIG.discordMention} `
    : '';

  const embed = {
    title: `🧪 Test Alert: BookMyShow Karwar Multi-Tracker Connected!`,
    description: `Your Discord Webhook and multi-movie tracking pipeline is **fully operational**! When tickets for **${movieTitle}** (or any added movie) open in Karwar, you will receive an instant notification here.`,
    url: URLS.regionHome,
    color: 5763719, // Emerald Green
    fields: [
      {
        name: '📍 Target Region',
        value: `**Karwar** (\`${CONFIG.region}\`)`,
        inline: true,
      },
      {
        name: '🎯 Sample Movie',
        value: `**${movieTitle}**`,
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
      text: 'BookMyShow Karwar Multi-Tracker • Test Mode Successful',
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: `${mentionText}✅ **BookMyShow Karwar Multi-Tracker Test Notification**`,
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
// MAIN CLI EXECUTION
// ==========================================

async function main() {
  console.log(`=======================================================`);
  console.log(`🎬 BookMyShow Karwar Multi-Movie Ticket Tracker`);
  console.log(`📍 Region: ${CONFIG.region.toUpperCase()}`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  console.log(`=======================================================`);

  if (CONFIG.testMode) {
    console.log(`[MODE] Test Mode Active.`);
    if (!CONFIG.discordWebhookUrl) {
      console.error(`[ERROR] DISCORD_WEBHOOK_URL is not defined in environment variables!`);
      process.exit(1);
    }
    const success = await sendTestAlert();
    process.exit(success ? 0 : 1);
  }

  // Check all tracked movies
  try {
    const { results } = await checkAllMovies(null, { sendAlerts: true });
    console.log(`\n================== SUMMARY ==================`);
    for (const r of results) {
      console.log(`- ${r.movie.title}: Found=${r.isFound} | Live=${r.isLive} | Status=${r.strategyUsed}`);
    }
    console.log(`=============================================\n`);
    console.log(`[DONE] Tracker cycle finished cleanly.`);
  } catch (error) {
    console.error(`[MAIN] Soft error during tracker run:`, error.message);
    process.exit(0);
  }
}

// Export modules for Next.js API routes & test suites
module.exports = {
  checkMovieAvailability,
  checkAllMovies,
  sendTicketsLiveAlert,
  sendTestAlert,
  loadState,
  saveState,
  addMovieToState,
  removeMovieFromState,
  getMovieMatcher,
  isTitleMatch,
  CONFIG,
  URLS,
};

// Execute if run directly from CLI / GitHub Actions
if (require.main === module) {
  main().catch(err => {
    console.error(`[FATAL] Unhandled fatal error:`, err);
    process.exit(CONFIG.testMode ? 1 : 0);
  });
}
