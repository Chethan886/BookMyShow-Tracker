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
    } = require('../../../tracker');

    const body = await request.json().catch(() => ({}));
    const { movieId, all } = body;

    const state = loadState();
    const nowIso = new Date().toISOString();

    // Check specific movie if movieId provided
    if (movieId && !all) {
      const targetMovie = (state.movies || []).find(m => m.id === movieId);
      if (!targetMovie) {
        return NextResponse.json(
          { success: false, error: `Movie with id "${movieId}" not found in tracker state.` },
          { status: 404 }
        );
      }

      console.log(`[API:TRACK] Manual check for single movie "${targetMovie.title}"`);
      const result = await checkMovieAvailability(targetMovie);

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

    return NextResponse.json({
      success: true,
      mode: 'all',
      results,
      movies: state.movies,
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
