import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const {
      checkMovieAvailability,
      checkAllMovies,
      sendTicketsLiveAlert,
      loadState,
      saveState,
      addMovieToState,
    } = require('../../../tracker');

    const body = await request.json().catch(() => ({}));
    const { movieId, all } = body;

    const state = loadState();
    const nowIso = new Date().toISOString();

    // Check specific movie if movieId provided
    if (movieId && !all) {
      const searchId = String(movieId).toLowerCase().trim();
      const searchTitle = String(body.title || body.movie?.title || '').toLowerCase().trim();
      const searchRegion = String(body.region || body.movie?.region || '').toLowerCase().trim();

      let targetMovie = (state.movies || []).find(
        m => m.id.toLowerCase() === searchId ||
        (m.title.toLowerCase() === searchTitle && (m.region || '').toLowerCase() === searchRegion) ||
        (searchTitle && m.title.toLowerCase() === searchTitle && searchId.includes(m.id.toLowerCase()))
      );

      // If still not found in state, auto-register it from payload
      if (!targetMovie) {
        const fallbackTitle = body.title || body.movie?.title || (movieId.includes('-') ? movieId.split('-')[0] : movieId);
        const fallbackRegion = body.region || body.movie?.region || (movieId.includes('-') ? movieId.split('-').slice(1).join('-') : 'karwar');
        const fallbackKeywords = body.keywords || body.movie?.keywords || [fallbackTitle];

        console.log(`[API:TRACK] Auto-registering missing movie "${fallbackTitle}" in ${fallbackRegion}`);
        const added = addMovieToState({
          id: movieId,
          title: fallbackTitle,
          region: fallbackRegion,
          keywords: fallbackKeywords,
        });
        targetMovie = added.movie;
      }

      // Merge in any client-side overrides (keywords, region, etc.)
      if (body.movie) {
        targetMovie = { ...targetMovie, ...body.movie, id: targetMovie.id };
      }
      if (body.keywords && Array.isArray(body.keywords)) {
        targetMovie.keywords = body.keywords;
      }

      console.log(`[API:TRACK] Manual check for single movie "${targetMovie.title}" [Region: ${(targetMovie.region || 'karwar').toUpperCase()}]`);
      const result = await checkMovieAvailability(targetMovie, null, targetMovie.region);

      targetMovie.lastCheckTime = nowIso;
      targetMovie.detectedTitle = result.movieTitle;
      targetMovie.bookingUrl = result.bookingUrl;
      targetMovie.theaters = result.theaters;

      let alertDispatched = false;
      if (result.isLive) {
        targetMovie.lastStatus = 'LIVE';
        // Re-send alert if:
        // 1. Alert was never sent
        // 2. Last alert was sent more than 2 hours ago (re-notify in case user missed it)
        const lastAlertTime = targetMovie.lastAlertSentTime ? new Date(targetMovie.lastAlertSentTime).getTime() : 0;
        const hoursSinceAlert = (Date.now() - lastAlertTime) / (1000 * 60 * 60);
        const shouldAlert = !targetMovie.alertSent || hoursSinceAlert >= 2;

        if (shouldAlert) {
          console.log(`[API:TRACK] Sending live alert! alertSent=${targetMovie.alertSent}, hoursSinceAlert=${hoursSinceAlert.toFixed(1)}`);
          alertDispatched = await sendTicketsLiveAlert(result);
          if (alertDispatched) {
            targetMovie.alertSent = true;
            targetMovie.lastAlertSentTime = nowIso;
          }
        } else {
          console.log(`[API:TRACK] Tickets LIVE but alert already sent ${hoursSinceAlert.toFixed(1)}h ago, skipping duplicate.`);
        }
      } else if (result.isFound) {
        targetMovie.lastStatus = 'LISTED_COMING_SOON';
        // If movie was previously LIVE but now just listed (unlikely but possible), reset so next live triggers alert
        if (targetMovie.alertSent && targetMovie.lastStatus !== 'LIVE') {
          // Keep alertSent=true for now, only reset if fully not found
        }
      } else {
        targetMovie.lastStatus = 'NOT_YET_LISTED';
        // Reset alertSent if movie fell off the listings entirely (e.g. cancelled)
        // so we can re-alert if it comes back
        if (targetMovie.alertSent) {
          console.log(`[API:TRACK] Movie no longer found — resetting alertSent flag to allow future re-notification.`);
          targetMovie.alertSent = false;
        }
      }

      // Sync updated movie back into state
      const movieIdx = state.movies.findIndex(m => m.id === targetMovie.id);
      if (movieIdx >= 0) {
        state.movies[movieIdx] = { ...state.movies[movieIdx], ...targetMovie };
      }

      try {
        saveState(state);
      } catch {
        // Vercel serverless read-only filesystem — non-fatal
      }

      return NextResponse.json({
        success: true,
        mode: 'single',
        result,
        movie: targetMovie,
        movies: state.movies,
        alertDispatched,
        isLive: result.isLive,
        isFound: result.isFound,
        timestamp: nowIso,
      });
    }

    // Otherwise, check all tracked movies in batch
    const activeRegion = (body.region || state.settings?.region || 'karwar').toLowerCase();
    console.log(`[API:TRACK] Manual batch check for all tracked movies`);

    // Pass client-provided movies list if available (has latest keywords/intervals)
    const moviesToCheck = body.movies && Array.isArray(body.movies) && body.movies.length > 0
      ? body.movies
      : state.movies;

    const { results } = await checkAllMovies(moviesToCheck, { sendAlerts: true, region: activeRegion, forceAlertAfterHours: 2 });

    // Re-load state after checkAllMovies updates it so we return fresh movie data
    const updatedState = loadState();

    return NextResponse.json({
      success: true,
      mode: 'all',
      results,
      movies: updatedState.movies,
      timestamp: nowIso,
    });
  } catch (error) {
    console.error('[API:TRACK] Error during tracking run:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Tracking execution failed',
      },
      { status: 500 }
    );
  }
}
