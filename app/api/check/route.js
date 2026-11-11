/**
 * /api/check — Lightweight movie availability checker using BMS JSON API only.
 * 
 * Unlike /api/track (which uses curl + full HTML scraping pipeline),
 * this route uses only axios to hit the BMS public mobile JSON API endpoints.
 * These endpoints are NOT Cloudflare-blocked, so they work reliably on Vercel serverless.
 * 
 * Falls back to /api/track if the JSON API doesn't find the movie.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const axios = require('axios');

const BMS_MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
  'X-App-Code': 'MOBAND2',
  'X-Appversion': '14390',
  'Origin': 'https://in.bookmyshow.com',
};

function isTitleMatch(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return false;
  const lower = text.toLowerCase();
  // Only use keywords >= 4 chars to avoid false positives from short terms
  const meaningful = keywords.filter(k => k && k.length >= 4);
  if (meaningful.length === 0) return false;
  return meaningful.some(kw => lower.includes(kw.toLowerCase()));
}

async function checkBmsJsonApi(region, keywords, title) {
  const r = (region || 'karwar').toLowerCase().trim();
  const baseUrl = 'https://in.bookmyshow.com/api/explore/v1/list/movies';
  const baseParams = {
    appCode: 'MOBAND2',
    appVersion: '14390',
    language: 'EN',
    layoutType: 'MDOT',
    city: r,
    homeCityCode: r,
    limit: '30',
    totalCount: '30',
  };

  const allKeywords = Array.isArray(keywords)
    ? keywords
    : (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()) : [title]);

  // Always include the title itself
  if (!allKeywords.some(k => k.toLowerCase() === title.toLowerCase())) {
    allKeywords.unshift(title);
  }

  for (const status of ['nowShowing', 'comingSoon']) {
    try {
      const params = new URLSearchParams({ ...baseParams, status });
      const url = `${baseUrl}?${params.toString()}`;
      console.log(`[API:CHECK] Fetching BMS ${status} JSON API for ${r.toUpperCase()}...`);

      const res = await axios.get(url, {
        headers: {
          ...BMS_MOBILE_HEADERS,
          'Referer': `https://in.bookmyshow.com/explore/movies-${r}`,
        },
        timeout: 12000,
      });

      const events = res.data?.BookMyShow?.arrEvents || res.data?.arrEvents || [];
      console.log(`[API:CHECK] ${r.toUpperCase()} ${status}: ${events.length} event(s) returned`);

      for (const ev of events) {
        const evName = ev.EventTitle || ev.EventName || ev.name || '';
        if (isTitleMatch(evName, allKeywords)) {
          const evUrl = ev.EventURL || ev.seoUrl || ev.url || '';
          const fullUrl = evUrl
            ? (evUrl.startsWith('http') ? evUrl : `https://in.bookmyshow.com${evUrl}`)
            : `https://in.bookmyshow.com/explore/movies-${r}`;

          const isLive = status === 'nowShowing' || Boolean(ev.isBookable || ev.isEventLive);
          console.log(`[API:CHECK] ✅ Found "${evName}" in ${status}: isLive=${isLive}`);
          return {
            isFound: true,
            isLive,
            movieTitle: evName,
            bookingUrl: fullUrl,
            strategyUsed: `BMS_API_${status.toUpperCase()}`,
          };
        }
      }
    } catch (err) {
      console.warn(`[API:CHECK] BMS ${status} API failed for ${r}: ${err.message}`);
    }
  }

  return null;
}

export async function POST(request) {
  const nowIso = new Date().toISOString();

  try {
    const body = await request.json().catch(() => ({}));
    const { movieId, title, region, keywords, movie } = body;

    const effectiveTitle = title || movie?.title || movieId || 'Unknown';
    const effectiveRegion = (region || movie?.region || 'karwar').toLowerCase();
    const effectiveKeywords = keywords || movie?.keywords || [effectiveTitle];

    console.log(`[API:CHECK] Manual check: "${effectiveTitle}" in ${effectiveRegion.toUpperCase()}`);

    // ── Layer 1: BMS JSON API (axios-only, works on Vercel) ──
    const apiResult = await checkBmsJsonApi(effectiveRegion, effectiveKeywords, effectiveTitle);

    if (apiResult) {
      // Also send Discord alert if live (mirror /api/track behavior)
      let alertDispatched = false;
      if (apiResult.isLive) {
        try {
          const { sendTicketsLiveAlert } = require('../../../tracker');
          const movieState = movie || {};
          const alertData = {
            movieTitle: apiResult.movieTitle,
            movie: { title: effectiveTitle, region: effectiveRegion, ...movieState },
            region: effectiveRegion,
            bookingUrl: apiResult.bookingUrl,
            theaters: movieState.theaters || [],
            strategyUsed: apiResult.strategyUsed,
            isLive: true,
            isFound: true,
          };

          // Only alert if not already sent recently
          const lastAlertTime = movieState.lastAlertSentTime
            ? new Date(movieState.lastAlertSentTime).getTime()
            : 0;
          const hoursSinceAlert = (Date.now() - lastAlertTime) / (1000 * 60 * 60);
          const shouldAlert = !movieState.alertSent || hoursSinceAlert >= 2;

          if (shouldAlert) {
            alertDispatched = await sendTicketsLiveAlert(alertData);
          }
        } catch (alertErr) {
          console.warn(`[API:CHECK] Alert dispatch failed: ${alertErr.message}`);
        }
      }

      return NextResponse.json({
        success: true,
        source: 'bms_json_api',
        result: apiResult,
        movie: {
          ...(movie || {}),
          id: movieId || movie?.id,
          title: effectiveTitle,
          region: effectiveRegion,
          lastCheckTime: nowIso,
          lastStatus: apiResult.isLive ? 'LIVE' : (apiResult.isFound ? 'LISTED_COMING_SOON' : 'NOT_YET_LISTED'),
          detectedTitle: apiResult.movieTitle,
          bookingUrl: apiResult.bookingUrl,
          alertSent: apiResult.isLive && alertDispatched ? true : (movie?.alertSent || false),
          lastAlertSentTime: apiResult.isLive && alertDispatched ? nowIso : (movie?.lastAlertSentTime || null),
        },
        alertDispatched,
        isLive: apiResult.isLive,
        isFound: apiResult.isFound,
        timestamp: nowIso,
      });
    }

    // ── Layer 2: Fall back to full /api/track pipeline (uses curl + HTML scraping) ──
    // This runs the full tracker pipeline which may work if curl is available (GitHub Actions / local)
    console.log(`[API:CHECK] BMS JSON API found nothing — falling back to full tracker pipeline`);
    try {
      const { checkMovieAvailability, sendTicketsLiveAlert } = require('../../../tracker');
      const movieInput = {
        ...(movie || {}),
        id: movieId || movie?.id,
        title: effectiveTitle,
        region: effectiveRegion,
        keywords: effectiveKeywords,
      };

      const result = await checkMovieAvailability(movieInput, null, effectiveRegion);

      let alertDispatched = false;
      if (result.isLive) {
        const movieState = movie || {};
        const lastAlertTime = movieState.lastAlertSentTime
          ? new Date(movieState.lastAlertSentTime).getTime()
          : 0;
        const hoursSinceAlert = (Date.now() - lastAlertTime) / (1000 * 60 * 60);
        if (!movieState.alertSent || hoursSinceAlert >= 2) {
          alertDispatched = await sendTicketsLiveAlert({
            ...result,
            movie: movieInput,
            theaters: movieState.theaters || result.theaters || [],
          });
        }
      }

      return NextResponse.json({
        success: true,
        source: 'full_tracker',
        result,
        movie: {
          ...(movie || {}),
          id: movieId || movie?.id,
          title: effectiveTitle,
          region: effectiveRegion,
          lastCheckTime: nowIso,
          lastStatus: result.isLive ? 'LIVE' : (result.isFound ? 'LISTED_COMING_SOON' : 'NOT_YET_LISTED'),
          detectedTitle: result.movieTitle,
          bookingUrl: result.bookingUrl,
          alertSent: result.isLive && alertDispatched ? true : (movie?.alertSent || false),
          lastAlertSentTime: result.isLive && alertDispatched ? nowIso : (movie?.lastAlertSentTime || null),
        },
        alertDispatched,
        isLive: result.isLive,
        isFound: result.isFound,
        timestamp: nowIso,
      });
    } catch (trackerErr) {
      console.error(`[API:CHECK] Full tracker pipeline failed: ${trackerErr.message}`);
      // Return "not found" gracefully rather than 500
      return NextResponse.json({
        success: true,
        source: 'fallback_not_found',
        result: { isFound: false, isLive: false, movieTitle: effectiveTitle, bookingUrl: `https://in.bookmyshow.com/explore/movies-${effectiveRegion}`, strategyUsed: 'NONE' },
        movie: {
          ...(movie || {}),
          id: movieId || movie?.id,
          title: effectiveTitle,
          region: effectiveRegion,
          lastCheckTime: nowIso,
          lastStatus: 'NOT_YET_LISTED',
        },
        alertDispatched: false,
        isLive: false,
        isFound: false,
        timestamp: nowIso,
      });
    }
  } catch (error) {
    console.error('[API:CHECK] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

