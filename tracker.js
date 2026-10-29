/**
 * BookMyShow Movie Ticket Availability Tracker
 * 
 * Automates detection of movie release and booking availability
 * across selectable regions (e.g. Karwar, Bengaluru, Mangaluru, etc.)
 * for multiple tracked movies, dispatching instant rich Discord webhook alerts.
 * Designed for serverless scheduled runs on GitHub Actions and Next.js / Vercel.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');

// ==========================================
// POPULAR REGION PRESETS
// ==========================================

const POPULAR_PLACES = [
  { slug: 'karwar', name: 'Karwar, Karnataka', cinema: 'Miraj Cinemas: Geetanjali, Karwar' },
  { slug: 'bengaluru', name: 'Bengaluru / Bangalore', cinema: 'PVR, INOX, Cinepolis' },
  { slug: 'mangaluru', name: 'Mangaluru / Mangalore', cinema: 'PVR, Bharat Cinemas, Cinepolis' },
  { slug: 'hubli', name: 'Hubballi / Hubli', cinema: 'Cinepolis, PVR Urban Oasis' },
  { slug: 'belgaum', name: 'Belagavi / Belgaum', cinema: 'Inox, Carnival Cinemas' },
  { slug: 'mysuru', name: 'Mysuru / Mysore', cinema: 'DRC Cinemas, INOX' },
  { slug: 'manipal', name: 'Manipal / Udupi', cinema: 'Bharat Cinemas, INOX' },
  { slug: 'goa', name: 'Goa (Panaji / Margao)', cinema: 'INOX Panaji, Osia' },
  { slug: 'mumbai', name: 'Mumbai', cinema: 'PVR, INOX, Cinepolis' },
  { slug: 'hyderabad', name: 'Hyderabad', cinema: 'Prasads Multiplex, AMB Cinemas' },
  { slug: 'chennai', name: 'Chennai', cinema: 'Sathyam Cinemas, PVR' },
  { slug: 'ncr', name: 'Delhi-NCR', cinema: 'PVR Directors Cut, Cinepolis' },
  { slug: 'pune', name: 'Pune', cinema: 'Cinepolis, PVR Phoenix' },
];

// ==========================================
// CONFIGURATION & ENVIRONMENT VARIABLES
// ==========================================

const CONFIG = {
  // Default Region (BookMyShow slug)
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
  // process.cwd() = project root in local dev, GitHub Actions, and Vercel serverless.
  // __dirname can be /var/task/app in Vercel, so we use cwd() which always = project root.
  stateFile: path.join(process.cwd(), process.env.STATE_FILE || 'state.json'),

  // Default check interval in minutes (5, 10, 15, 20, 30, 60)
  defaultIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || '15', 10),

  // Execution Flags
  forceAlert: process.env.FORCE_ALERT === 'true',
  testMode: process.argv.includes('--test') || process.env.TEST_ALERT === 'true',

  // Network & Request Options
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '2500', 10),
};

/**
 * Returns dynamic BookMyShow URLs for any given region slug
 */
function getRegionUrls(regionSlug) {
  const r = String(regionSlug || CONFIG.region || 'karwar').toLowerCase().trim();
  return {
    region: r,
    regionHome: `https://in.bookmyshow.com/explore/movies-${r}`,
    regionMovies: `https://in.bookmyshow.com/${r}/movies`,
    regionUpcoming: `https://in.bookmyshow.com/explore/upcoming-movies-${r}`,
    // Public JSON API endpoints â€” much less likely to 403 than rendered pages
    nowShowingApi: `https://in.bookmyshow.com/api/explore/v1/list/movies?appCode=MOBAND2&appVersion=14390&language=EN&status=nowShowing&layoutType=MDOT&city=${r}&homeCityCode=${r}&limit=10&totalCount=10`,
    comingSoonApi: `https://in.bookmyshow.com/api/explore/v1/list/movies?appCode=MOBAND2&appVersion=14390&language=EN&status=comingSoon&layoutType=MDOT&city=${r}&homeCityCode=${r}&limit=10&totalCount=10`,
    quickBookApi: `https://in.bookmyshow.com/serv/getData?cmd=QUICKBOOK&type=MT&f=json`,
  };
}

// Initial default URLs for legacy imports
const URLS = getRegionUrls(CONFIG.region);

// Default fallback cinema
const DEFAULT_KARWAR_CINEMA = 'Miraj Cinemas: Geetanjali, Karwar';

function getDefaultCinemaForRegion(regionSlug) {
  const found = POPULAR_PLACES.find(p => p.slug === regionSlug.toLowerCase());
  return found ? found.cinema : `${regionSlug.toUpperCase()} Theaters & Multiplexes`;
}

// Default baseline movie
const DEFAULT_RAMAYANA_MOVIE = {
  id: 'ramayana-karwar',
  title: 'Ramayana',
  keywords: ['Ramayana', 'Ramayana: Part 1', 'Ramayana - Part 1', 'Ramayan'],
  region: 'karwar',
  alertSent: false,
  lastCheckTime: null,
  lastStatus: 'NOT_YET_LISTED',
  detectedTitle: null,
  bookingUrl: URLS.regionHome,
  theaters: [DEFAULT_KARWAR_CINEMA],
  lastAlertSentTime: null,
};


// ==========================================
// HTTP CLIENT SETUP (Cloudflare JA3 Bypass with curl)
// ==========================================

function curlFetch(url, region = 'karwar', options = {}) {
  return new Promise((resolve, reject) => {
    const isJson = options.isJson || false;
    const r = (region || CONFIG.region || 'karwar').toLowerCase();
    const ua = isJson
      ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

    const args = [
      '-s',
      '-L',
      '--compressed',
      '--max-time', '15',
      '-A', ua,
      '-H', isJson ? 'Accept: application/json, text/plain, */*' : 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', `Referer: https://in.bookmyshow.com/explore/movies-${r}`,
      '-H', `Cookie: RgnCode=${r.toUpperCase()}; bmsId=1.${Date.now()}.${Math.floor(Math.random() * 1000000)};`,
    ];

    if (isJson) {
      args.push('-H', 'X-App-Code: MOBAND2');
      args.push('-H', 'X-Appversion: 14390');
      args.push('-H', 'Origin: https://in.bookmyshow.com');
    } else {
      args.push('-H', 'Sec-Ch-Ua: "Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"');
      args.push('-H', 'Sec-Ch-Ua-Mobile: ?0');
      args.push('-H', 'Sec-Ch-Ua-Platform: "Windows"');
      args.push('-H', 'Sec-Fetch-Dest: document');
      args.push('-H', 'Sec-Fetch-Mode: navigate');
      args.push('-H', 'Sec-Fetch-Site: none');
      args.push('-H', 'Sec-Fetch-User: ?1');
      args.push('-H', 'Upgrade-Insecure-Requests: 1');
    }

    args.push(url);

    execFile('curl', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout || stdout.length === 0) return reject(new Error('Empty response from curl'));
      if (isJson) {
        try {
          return resolve({ data: JSON.parse(stdout), status: 200 });
        } catch {
          return resolve({ data: stdout, status: 200 });
        }
      }
      return resolve({ data: stdout, status: 200 });
    });
  });
}

function createBrowserHeaders(regionSlug) {
  const r = (regionSlug || CONFIG.region || 'karwar').toUpperCase();
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://in.bookmyshow.com/',
    'Cookie': `RgnCode=${r}; bmsId=1.${Date.now()}.${Math.floor(Math.random() * 1000000)};`,
  };
}

const httpClient = axios.create({
  timeout: CONFIG.timeoutMs,
  headers: createBrowserHeaders(CONFIG.region),
  validateStatus: status => status >= 200 && status < 400,
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, retries = CONFIG.maxRetries) {
  const region = options.region || CONFIG.region || 'karwar';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[HTTP] Fetching ${url} (Attempt ${attempt}/${retries})`);
      // Try curl first (bypasses Cloudflare TLS fingerprinting)
      try {
        const curlRes = await curlFetch(url, region, options);
        return curlRes;
      } catch (curlErr) {
        console.warn(`[HTTP] curl attempt failed (${curlErr.message}), trying axios fallback...`);
        const response = await httpClient.get(url, options);
        return response;
      }
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
    settings: {
      region: CONFIG.region,
      regionName: 'Karwar, Karnataka',
      checkIntervalMinutes: CONFIG.defaultIntervalMinutes,
      discordMention: CONFIG.discordMention,
    },
    movies: [ { ...DEFAULT_RAMAYANA_MOVIE } ],
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
        region: parsed.settings?.region || CONFIG.region,
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

    // Ensure settings exist
    const settings = {
      ...defaultState.settings,
      ...(parsed.settings || {}),
    };

    const primary = parsed.movies[0];
    return {
      ...defaultState,
      ...parsed,
      settings,
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
    console.log(`[STATE] Saved state to ${path.basename(CONFIG.stateFile)} (${state.movies ? state.movies.length : 1} movies, Region: ${state.settings?.region || 'default'})`);
  } catch (error) {
    console.error(`[STATE] Failed to write state file:`, error.message);
  }
}

/**
 * Add or update a movie tracker in state.json
 * Supports multiple trackers for the same movie across different regions!
 * e.g., "Ramayana (Karwar)" and "Ramayana (Bengaluru)" are separate trackers.
 */
function addMovieToState(movieInput) {
  const state = loadState();
  const title = (movieInput.title || '').trim();
  if (!title) {
    throw new Error('Movie title cannot be empty.');
  }

  const movieRegion = (movieInput.region || state.settings?.region || CONFIG.region).toLowerCase().trim();
  const regionUrls = getRegionUrls(movieRegion);

  // Unique ID per movie + region
  const baseId = `${slugify(title)}-${slugify(movieRegion)}`;
  let id = movieInput.id || baseId;

  // Check if this exact tracker already exists
  const existingIdx = state.movies.findIndex(m => m.id === id);

  // If adding from form without explicit id, and exact duplicate exists, append unique suffix
  if (!movieInput.id && existingIdx >= 0) {
    id = `${baseId}-${Date.now().toString(36).slice(-4)}`;
  }

  let keywords = [];
  if (Array.isArray(movieInput.keywords)) {
    keywords = movieInput.keywords.map(k => String(k).trim()).filter(Boolean);
  } else if (typeof movieInput.keywords === 'string') {
    keywords = movieInput.keywords.split(',').map(k => k.trim()).filter(Boolean);
  }
  if (!keywords.some(k => k.toLowerCase() === title.toLowerCase())) {
    keywords.unshift(title);
  }

  const movieEntry = {
    id,
    title,
    keywords,
    region: movieRegion,
    alertSent: false,
    lastCheckTime: null,
    lastStatus: 'NOT_YET_LISTED',
    detectedTitle: null,
    bookingUrl: regionUrls.regionHome,
    theaters: [getDefaultCinemaForRegion(movieRegion)],
    lastAlertSentTime: null,
    addedAt: new Date().toISOString(),
  };

  if (movieInput.id && existingIdx >= 0) {
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

  if (state.movies.length === 0) {
    state.movies = [ { ...DEFAULT_RAMAYANA_MOVIE } ];
  }

  saveState(state);
  return { state, removed: beforeCount > state.movies.length };
}

/**
 * Update global settings (place/region, check interval, mention)
 */
function updateSettingsInState(newSettings) {
  const state = loadState();
  const updatedSettings = {
    ...state.settings,
    ...newSettings,
  };

  if (newSettings.region) {
    updatedSettings.region = slugify(newSettings.region);
    const place = POPULAR_PLACES.find(p => p.slug === updatedSettings.region);
    if (place) {
      updatedSettings.regionName = place.name;
    } else {
      updatedSettings.regionName = newSettings.regionName || `${updatedSettings.region.toUpperCase()}`;
    }
  }

  if (newSettings.checkIntervalMinutes !== undefined) {
    const mins = parseInt(newSettings.checkIntervalMinutes, 10);
    updatedSettings.checkIntervalMinutes = isNaN(mins) ? 15 : mins;
  }

  state.settings = updatedSettings;
  saveState(state);
  return { state, settings: updatedSettings };
}

// ==========================================
// MATCHER & DETECTION STRATEGIES
// ==========================================

function getMovieMatcher(movieInput) {
  if (!movieInput) {
    return {
      id: 'ramayana',
      title: 'Ramayana',
      region: CONFIG.region,
      keywords: CONFIG.defaultKeywords,
      regex: CONFIG.defaultRegex,
    };
  }

  const title = movieInput.title || 'Ramayana';
  const id = movieInput.id || slugify(title);
  const region = (movieInput.region || CONFIG.region || 'karwar').toLowerCase().trim();

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
    const escapedTerms = keywords.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    regex = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'i');
  }

  return { id, title, region, keywords, regex };
}

function isTitleMatch(text, matcher) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  const m = matcher || { regex: CONFIG.defaultRegex, keywords: CONFIG.defaultKeywords };
  if (m.regex && m.regex.test(clean)) return true;
  const lower = clean.toLowerCase();
  return m.keywords.some(kw => lower.includes(kw));
}

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

function parseDomForMovie(html, pageUrl, matcher) {
  const matches = [];
  try {
    const $ = cheerio.load(html);

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

function parseQuickBookData(data, matcher, regionHomeUrl) {
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
            bookingUrl: regionHomeUrl,
            isBookable: true,
            source: 'QUICKBOOK_API',
          };
        }
      }
      return {
        title: matcher.title,
        bookingUrl: regionHomeUrl,
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
// REGION PAGE FETCHING (API-first, HTML fallback)
// ==========================================

const regionalCache = {};

/**
 * Fetch BMS public API JSON for now-showing + coming-soon movies in a region.
 * These API endpoints are far less aggressively rate-limited than the rendered HTML pages.
 */
async function fetchBmsApiMovies(regionSlug) {
  const r = (regionSlug || CONFIG.region || 'karwar').toLowerCase().trim();
  const baseParams = new URLSearchParams({
    appCode: 'MOBAND2',
    appVersion: '14390',
    language: 'EN',
    layoutType: 'MDOT',
    city: r,
    homeCityCode: r,
    limit: '10',
    totalCount: '10',
  });

  const apiHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
    'X-App-Code': 'MOBAND2',
    'X-Appversion': '14390',
    'Referer': `https://in.bookmyshow.com/explore/movies-${r}`,
    'Origin': 'https://in.bookmyshow.com',
  };

  const results = {};

  for (const status of ['nowShowing', 'comingSoon']) {
    const url = `https://in.bookmyshow.com/api/explore/v1/list/movies?${baseParams.toString()}&status=${status}`;
    try {
      console.log(`[API] Fetching BMS ${status} API for ${r.toUpperCase()}...`);
      const res = await curlFetch(url, r, { isJson: true });
      results[status] = res.data;
      const count = res.data?.BookMyShow?.arrEvents?.length || res.data?.arrEvents?.length || 0;
      console.log(`[API] ${r.toUpperCase()} ${status}: ${count} movie(s) returned`);
    } catch (err) {
      const code = err.response?.status || err.code || 'ERR';
      console.warn(`[API] ${r.toUpperCase()} ${status} failed [${code}]:`, err.message);
      results[status] = null;
    }
  }

  return results;
}

async function fetchRegionPages(targetRegion, forceFresh = false) {
  const r = (targetRegion || CONFIG.region || 'karwar').toLowerCase().trim();
  const now = Date.now();

  if (!forceFresh && regionalCache[r] && now - regionalCache[r].timestamp < 25000) {
    return regionalCache[r].data;
  }

  const regionUrls = getRegionUrls(r);
  const headers = createBrowserHeaders(r);

  // --- Strategy A: Public JSON API (preferred, rarely 403d) ---
  const apiData = await fetchBmsApiMovies(r);

  // --- Strategy B: HTML pages (fallback; may 403 server-side) ---
  const htmlPages = [
    { url: regionUrls.regionHome, name: `${r.toUpperCase()} Explore Movies` },
    { url: regionUrls.regionMovies, name: `${r.toUpperCase()} Movies Landing` },
    { url: regionUrls.regionUpcoming, name: `${r.toUpperCase()} Upcoming Movies` },
  ];

  const fetchedPages = [];
  for (const page of htmlPages) {
    try {
      console.log(`\n--- Fetching: ${page.name} (${page.url}) ---`);
      const res = await fetchWithRetry(page.url, { headers });
      fetchedPages.push({ ...page, html: res.data });
    } catch (err) {
      console.warn(`[FETCH] Could not fetch ${page.name}: ${err.message}`);
      fetchedPages.push({ ...page, html: null, error: err.message });
    }
  }

  // --- Strategy C: QuickBook API fallback ---
  let quickBookData = null;
  try {
    console.log(`[HTTP] Checking BMS QuickBook API for ${r.toUpperCase()}...`);
    const qbRes = await httpClient.get(regionUrls.quickBookApi, {
      headers: {
        ...headers,
        'Accept': 'application/json, text/plain, */*',
        'Referer': regionUrls.regionHome,
      },
    });
    quickBookData = qbRes.data;
  } catch (err) {
    console.log(`[HTTP] QuickBook API returned non-fatal error:`, err.message);
  }

  regionalCache[r] = {
    timestamp: now,
    data: { region: r, regionUrls, pages: fetchedPages, quickBookData, apiData },
  };

  return regionalCache[r].data;
}

/**
 * Check availability for a single movie in its target region
 */
async function checkMovieAvailability(movieInput, preloadedData = null, overrideRegion = null) {
  const matcher = getMovieMatcher(movieInput);
  const effectiveRegion = (overrideRegion || movieInput?.region || matcher.region || CONFIG.region || 'karwar').toLowerCase();
  const regionUrls = getRegionUrls(effectiveRegion);
  const cinemaDefault = getDefaultCinemaForRegion(effectiveRegion);

  const result = {
    movie: {
      id: matcher.id,
      title: matcher.title,
      keywords: matcher.keywords,
      region: effectiveRegion,
    },
    region: effectiveRegion,
    isFound: false,
    isLive: false,
    movieTitle: matcher.title,
    bookingUrl: regionUrls.regionHome,
    theaters: [cinemaDefault],
    strategyUsed: 'NONE',
  };

  const data = preloadedData || (await fetchRegionPages(effectiveRegion));

  // =============================================
  // Layer 0: BMS Public JSON API (API-first, avoids 403)
  // =============================================
  if (data.apiData) {
    for (const [statusKey, apiPayload] of Object.entries(data.apiData)) {
      if (!apiPayload) continue;
      // BMS API returns events in BookMyShow.arrEvents or root arrEvents
      const events = apiPayload?.BookMyShow?.arrEvents || apiPayload?.arrEvents || [];
      for (const ev of events) {
        const evName = ev.EventTitle || ev.EventName || ev.name || '';
        if (isTitleMatch(evName, matcher)) {
          const evUrl = ev.EventURL || ev.seoUrl || ev.url || '';
          const fullUrl = evUrl
            ? (evUrl.startsWith('http') ? evUrl : `https://in.bookmyshow.com${evUrl}`)
            : regionUrls.regionHome;
          const isBookable = statusKey === 'nowShowing' || Boolean(ev.isBookable || ev.isEventLive);
          result.isFound = true;
          result.isLive = isBookable;
          result.movieTitle = evName;
          result.bookingUrl = fullUrl;
          result.strategyUsed = `BMS_API_${statusKey.toUpperCase()}`;
          console.log(`[DETECTION] BMS API ${statusKey} hit: "${evName}" | Live: ${isBookable}`);
          if (isBookable) return result;
        }
      }
    }
  }

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
    const apiMatch = parseQuickBookData(data.quickBookData, matcher, regionUrls.regionHome);
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
  const defaultRegion = (options.region || state.settings?.region || CONFIG.region || 'karwar').toLowerCase();

  console.log(`\n=======================================================`);
  console.log(`ðŸŽ¬ Checking ${moviesToCheck.length} Movie(s) in BookMyShow [Region: ${defaultRegion.toUpperCase()}]`);
  console.log(`=======================================================`);

  // Group movies by their target region to fetch pages once per distinct region
  const moviesByRegion = {};
  for (const m of moviesToCheck) {
    const reg = (m.region || defaultRegion).toLowerCase();
    if (!moviesByRegion[reg]) moviesByRegion[reg] = [];
    moviesByRegion[reg].push(m);
  }

  const results = [];
  const nowIso = new Date().toISOString();

  for (const [regionSlug, movieList] of Object.entries(moviesByRegion)) {
    const preloaded = await fetchRegionPages(regionSlug, Boolean(options.forceFresh));

    for (const m of movieList) {
      const res = await checkMovieAvailability(m, preloaded, regionSlug);
      results.push(res);

      const movieEntry = state.movies.find(
        item => item.id === m.id ||
        (item.title.toLowerCase() === m.title.toLowerCase() && (item.region || '').toLowerCase() === regionSlug.toLowerCase())
      );
      if (movieEntry) {
        movieEntry.lastCheckTime = nowIso;
        movieEntry.detectedTitle = res.movieTitle;
        movieEntry.bookingUrl = res.bookingUrl;
        movieEntry.region = regionSlug;

        if (res.isLive) {
          movieEntry.lastStatus = 'LIVE';
          if (!movieEntry.alertSent || CONFIG.forceAlert) {
            if (options.sendAlerts !== false) {
              console.log(`[ALERT] ðŸš¨ Live tickets detected for "${movieEntry.title}" in ${regionSlug.toUpperCase()}! Sending Discord alert...`);
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
  }

  // Mirror primary movie for backward compatibility
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
 * Dispatch rich ticket alert embed for a specific movie in a specific region
 */
async function sendTicketsLiveAlert(details) {
  const title = details.movieTitle || details.movie?.title || 'Tracked Movie';
  const regionSlug = details.region || details.movie?.region || CONFIG.region || 'karwar';
  const place = POPULAR_PLACES.find(p => p.slug === regionSlug);
  const regionName = place ? place.name : `${regionSlug.toUpperCase()}, India`;

  const mentionText = CONFIG.discordMention && CONFIG.discordMention.toLowerCase() !== 'none'
    ? `${CONFIG.discordMention} `
    : '';

  const embed = {
    title: `ðŸš¨ TICKETS ARE LIVE: ${title}!`,
    description: `Bookings have opened or showtimes have been listed on **BookMyShow ${regionName}** for **${title}**!\n\nGrab your seats before shows fill up!`,
    url: details.bookingUrl || getRegionUrls(regionSlug).regionHome,
    color: 16270436, // BMS Red (#F84464)
    fields: [
      {
        name: 'ðŸŽ¬ Movie Title',
        value: `**${title}**`,
        inline: true,
      },
      {
        name: 'ðŸ“ Region / Place',
        value: `**${regionName}** (\`${regionSlug}\`)`,
        inline: true,
      },
      {
        name: 'ðŸ›ï¸ Cinema(s)',
        value: details.theaters && details.theaters.length > 0
          ? details.theaters.join('\n')
          : getDefaultCinemaForRegion(regionSlug),
        inline: false,
      },
      {
        name: 'ðŸŽŸï¸ Booking Status',
        value: 'ðŸŸ¢ **TICKETS LIVE / ADVANCE BOOKING OPEN**',
        inline: true,
      },
      {
        name: 'âš¡ Detection Method',
        value: `\`${details.strategyUsed || 'Automated Scraper'}\``,
        inline: true,
      },
      {
        name: 'ðŸ”— Direct Booking Link',
        value: `[ðŸ‘‰ Click here to Book on BookMyShow ${regionSlug.toUpperCase()}](${details.bookingUrl || getRegionUrls(regionSlug).regionHome})`,
        inline: false,
      },
    ],
    thumbnail: {
      url: 'https://in.bmscdn.com/webin/common/icons/bms.png',
    },
    footer: {
      text: `BookMyShow ${regionSlug.toUpperCase()} Tracker â€¢ Instant Push Alert`,
      icon_url: 'https://assets-in.bmscdn.com/webin/common/favicon.ico',
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: `${mentionText}ðŸš¨ **TICKETS ARE LIVE IN ${regionSlug.toUpperCase()} for ${title}!**`,
    embeds: [embed],
  };

  return await sendDiscordWebhook(payload);
}

/**
 * Dispatch test alert to verify Discord webhook connectivity
 */
async function sendTestAlert(movieTitle = 'Ramayana', regionSlug = 'karwar') {
  console.log(`[TEST] Dispatching verification alert to Discord webhook...`);
  const r = (regionSlug || CONFIG.region || 'karwar').toLowerCase();
  const place = POPULAR_PLACES.find(p => p.slug === r);
  const regionName = place ? place.name : `${r.toUpperCase()}, India`;

  const mentionText = CONFIG.discordMention && CONFIG.discordMention.toLowerCase() !== 'none'
    ? `${CONFIG.discordMention} `
    : '';

  const embed = {
    title: `ðŸ§ª Test Alert: BookMyShow Tracker Connected!`,
    description: `Your Discord Webhook and multi-region tracking pipeline is **fully operational**! When tickets for **${movieTitle}** (or any added movie) open in **${regionName}**, you will receive an instant notification here.`,
    url: getRegionUrls(r).regionHome,
    color: 5763719, // Emerald Green
    fields: [
      {
        name: 'ðŸ“ Monitored Place',
        value: `**${regionName}** (\`${r}\`)`,
        inline: true,
      },
      {
        name: 'ðŸŽ¯ Sample Movie',
        value: `**${movieTitle}**`,
        inline: true,
      },
      {
        name: 'ðŸ›ï¸ Monitored Theaters',
        value: getDefaultCinemaForRegion(r),
        inline: true,
      },
      {
        name: 'ðŸ”” Mention Level',
        value: `\`${CONFIG.discordMention}\``,
        inline: true,
      },
      {
        name: 'ðŸ”— Monitored URL',
        value: `[BookMyShow ${r.toUpperCase()} Page](${getRegionUrls(r).regionHome})`,
        inline: false,
      },
    ],
    footer: {
      text: 'BookMyShow Multi-Region Tracker â€¢ Test Mode Successful',
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    content: `${mentionText}âœ… **BookMyShow ${r.toUpperCase()} Tracker Test Notification**`,
    embeds: [embed],
  };

  const success = await sendDiscordWebhook(payload);
  if (success) {
    console.log(`[TEST] âœ… Verification test passed! Check your Discord channel.`);
  } else {
    console.error(`[TEST] âŒ Test failed. Please check your DISCORD_WEBHOOK_URL.`);
  }
  return success;
}

// ==========================================
// MAIN CLI EXECUTION
// ==========================================

async function main() {
  const state = loadState();
  const activeRegion = state.settings?.region || CONFIG.region || 'karwar';

  console.log(`=======================================================`);
  console.log(`ðŸŽ¬ BookMyShow Multi-Region Ticket Tracker`);
  console.log(`ðŸ“ Active Place: ${activeRegion.toUpperCase()}`);
  console.log(`â° Time: ${new Date().toISOString()}`);
  console.log(`=======================================================`);

  if (CONFIG.testMode) {
    console.log(`[MODE] Test Mode Active.`);
    if (!CONFIG.discordWebhookUrl) {
      console.error(`[ERROR] DISCORD_WEBHOOK_URL is not defined in environment variables!`);
      process.exit(1);
    }
    const success = await sendTestAlert('Ramayana', activeRegion);
    process.exit(success ? 0 : 1);
  }

  try {
    const { results } = await checkAllMovies(null, { sendAlerts: true, region: activeRegion });
    console.log(`\n================== SUMMARY ==================`);
    for (const r of results) {
      console.log(`- [${r.region.toUpperCase()}] ${r.movie.title}: Found=${r.isFound} | Live=${r.isLive} | Strategy=${r.strategyUsed}`);
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
  updateSettingsInState,
  getMovieMatcher,
  getRegionUrls,
  isTitleMatch,
  CONFIG,
  URLS,
  POPULAR_PLACES,
};

// Execute if run directly from CLI / GitHub Actions
if (require.main === module) {
  main().catch(err => {
    console.error(`[FATAL] Unhandled fatal error:`, err);
    process.exit(CONFIG.testMode ? 1 : 0);
  });
}

