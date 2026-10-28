import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const {
      checkMovieAvailability,
      sendTicketsLiveAlert,
      loadState,
      saveState,
    } = require('../../../tracker');

    console.log('[API:TRACK] Manual check triggered via frontend');
    const state = loadState();
    const result = await checkMovieAvailability();

    const nowIso = new Date().toISOString();
    state.lastCheckTime = nowIso;
    state.detectedTitle = result.movieTitle;
    state.bookingUrl = result.bookingUrl;
    state.theaters = result.theaters;

    let alertDispatched = false;
    if (result.isLive) {
      state.lastStatus = 'LIVE';
      if (!state.alertSent) {
        alertDispatched = await sendTicketsLiveAlert(result);
        if (alertDispatched) {
          state.alertSent = true;
          state.lastAlertSentTime = nowIso;
        }
      }
    } else if (result.isFound) {
      state.lastStatus = 'LISTED_COMING_SOON';
    } else {
      state.lastStatus = 'NOT_YET_LISTED';
    }

    try {
      saveState(state);
    } catch {
      // Vercel serverless filesystem is read-only outside /tmp
    }

    return NextResponse.json({
      success: true,
      result,
      state,
      alertDispatched,
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
