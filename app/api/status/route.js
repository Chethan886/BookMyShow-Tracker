import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { loadState, CONFIG } = require('../../../tracker');
    const state = loadState();

    return NextResponse.json({
      success: true,
      state,
      movies: state.movies || [],
      region: CONFIG.region,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API:STATUS] Error reading state:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
