import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { loadState, POPULAR_PLACES } = require('../../../tracker');
    const state = loadState();

    return NextResponse.json({
      success: true,
      settings: state.settings || {
        region: 'karwar',
        regionName: 'Karwar, Karnataka',
        checkIntervalMinutes: 15,
      },
      places: POPULAR_PLACES || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API:SETTINGS:GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { updateSettingsInState, POPULAR_PLACES } = require('../../../tracker');

    const { state, settings } = updateSettingsInState(body);

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully!',
      settings,
      places: POPULAR_PLACES || [],
      movies: state.movies,
    });
  } catch (error) {
    console.error('[API:SETTINGS:POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
