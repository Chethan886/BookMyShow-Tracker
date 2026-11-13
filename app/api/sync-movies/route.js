/**
 * /api/sync-movies — Saves the current tracked movies list to tracked-movies.json
 * in the GitHub repository so GitHub Actions can pick them up and check automatically.
 *
 * Uses GitHub Contents API with a Personal Access Token (GITHUB_TOKEN secret).
 * This is the bridge between the browser UI (localStorage) and GitHub Actions.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GITHUB_REPO = process.env.GITHUB_REPO || 'Chethan886/BookMyShow-Tracker';
const GITHUB_TOKEN = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
const FILE_PATH = 'tracked-movies.json';
const BRANCH = 'main';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { movies } = body;

    if (!movies || !Array.isArray(movies)) {
      return NextResponse.json({ success: false, error: 'movies array required' }, { status: 400 });
    }

    // Strip localStorage-only fields; keep only what GHA needs
    const cleanMovies = movies.map(m => ({
      id: m.id,
      title: m.title,
      region: m.region || 'karwar',
      keywords: Array.isArray(m.keywords) ? m.keywords : [m.title],
      intervalMinutes: m.intervalMinutes || 15,
      alertSent: m.alertSent || false,
      lastAlertSentTime: m.lastAlertSentTime || null,
    }));

    if (!GITHUB_TOKEN) {
      // No token configured — save locally to state.json as fallback
      console.warn('[SYNC] No GITHUB_PAT configured — cannot sync to repo. Movies will only be tracked when browser is open.');
      return NextResponse.json({
        success: false,
        error: 'GITHUB_PAT not configured. Add it in Vercel environment variables to enable background tracking.',
        localOnly: true,
      }, { status: 503 });
    }

    // Get current file SHA (needed for update)
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    let sha = undefined;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }

    // Encode new content
    const newContent = Buffer.from(JSON.stringify(cleanMovies, null, 2) + '\n').toString('base64');

    // PUT updated file
    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `chore: sync tracked movies [skip ci]`,
          content: newContent,
          branch: BRANCH,
          ...(sha ? { sha } : {}),
        }),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.text();
      console.error('[SYNC] GitHub API error:', err);
      return NextResponse.json({ success: false, error: `GitHub API error: ${putRes.status}` }, { status: 500 });
    }

    console.log(`[SYNC] ✅ Synced ${cleanMovies.length} movie(s) to ${FILE_PATH} in GitHub repo`);
    return NextResponse.json({
      success: true,
      synced: cleanMovies.length,
      movies: cleanMovies,
    });
  } catch (error) {
    console.error('[SYNC] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

