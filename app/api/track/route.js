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

      console.log(`[API:TRACK] Manual check for single movie "${targetMovie.title}" [Region: ${(targetMovie.region || 'karwar').toUpperCase()}]`);
      const result = await checkMovieAvailability(targetMovie, null, targetMovie.region);

      targetMovie.lastCheckTime = nowIso;
      targetMovie.detectedTitle = result.movieTitle;
      targetMovie.bookingUrl = result.bookingUrl;
      targetMovie.theaters = result.theaters;

      let alertDispatched = false;
      if (result.isLive) {
        targetMovie.lastStatus = 'LIVE';
        if (!targetMovie.alertSent) {
          alertDispatched = await sendTicketsLiveAlert(result);
          if (alertDispatched) {
            targetMovie.alertSent = true;
            targetMovie.lastAlertSentTime = nowIso;
          }
        }
      } else if (result.isFound) {
        targetMovie.lastStatus = 'LISTED_COMING_SOON';
      } else {
        targetMovie.lastStatus = 'NOT_YET_LISTED';
      }

      try {
        saveState(state);
      } catch {
        // Vercel serverless read-only filesystem handling
      }

      return NextResponse.json({
        success: true,
        mode: 'single',
        result,
        movie: targetMovie,
        movies: state.movies,
        alertDispatched,
        timestamp: nowIso,
      });
    }

    // Otherwise, check all tracked movies in batch
    const activeRegion = (body.region || state.settings?.region || 'karwar').toLowerCase();
    console.log(`[API:TRACK] Manual batch check for all tracked movies in ${activeRegion}`);
    const { results } = await checkAllMovies(state.movies, { sendAlerts: true, region: activeRegion });

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
