import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { loadState } = require('../../../tracker');
    const state = loadState();
    return NextResponse.json({
      success: true,
      movies: state.movies || [],
      settings: state.settings || {},
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API:MOVIES:GET] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { title, keywords, region, intervalMinutes } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'Movie title is required.' },
        { status: 400 }
      );
    }

    const { addMovieToState } = require('../../../tracker');
    const { state, movie } = addMovieToState({ title: title.trim(), keywords, region, intervalMinutes });

    return NextResponse.json({
      success: true,
      message: `"${movie.title}" added to BookMyShow ${movie.region.toUpperCase()} tracker!`,
      movie,
      movies: state.movies,
    });
  } catch (error) {
    console.error('[API:MOVIES:POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Movie id is required to delete.' },
        { status: 400 }
      );
    }

    const { removeMovieFromState } = require('../../../tracker');
    const { state, removed } = removeMovieFromState(id);

    return NextResponse.json({
      success: true,
      message: removed ? 'Movie removed successfully.' : 'Movie not found.',
      movies: state.movies,
    });
  } catch (error) {
    console.error('[API:MOVIES:DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}



export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id, intervalMinutes } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Movie id is required to update interval.' },
        { status: 400 }
      );
    }

    const { loadState, saveState } = require('../../../tracker');
    const state = loadState();
    const movie = (state.movies || []).find((m) => m.id === id);

    if (movie) {
      const mins = parseInt(intervalMinutes, 10);
      movie.intervalMinutes = isNaN(mins) ? 15 : mins;
      movie.checkIntervalMinutes = movie.intervalMinutes;
      try {
        saveState(state);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: 'Movie check interval updated successfully.',
      movie,
      movies: state.movies,
    });
  } catch (error) {
    console.error('[API:MOVIES:PATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
