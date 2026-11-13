/**
 * /api/sync-movies — Bidirectional sync between the browser UI and GitHub repo.
 *
 * GET  → Returns the current tracked-movies.json from the GitHub repo
 *         (so the UI can see what GitHub Actions is tracking)
 * POST → Writes the UI's movie list to tracked-movies.json in the GitHub repo
 *         (so GitHub Actions can track them even when browser is closed)
 *
 * Uses GitHub Contents API with a Personal Access Token (GITHUB_PAT env var).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GITHUB_REPO = process.env.GITHUB_REPO || 'Chethan886/BookMyShow-Tracker';
const GITHUB_TOKEN = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
const FILE_PATH = 'tracked-movies.json';
const STATE_PATH = 'state.json';
const BRANCH = 'main';

/**
 * GET — Fetch what GitHub Actions is currently tracking
 */
export async function GET() {
  try {
    if (!GITHUB_TOKEN) {
      // Fallback: read from local tracked-movies.json (works in dev / GHA runner)
      try {
        const fs = require('fs');
        const path = require('path');
        const localFile = path.join(process.cwd(), FILE_PATH);
        if (fs.existsSync(localFile)) {
          const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
          return NextResponse.json({ success: true, source: 'local', movies: data });
        }
      } catch {}
      return NextResponse.json({ success: true, source: 'none', movies: [], message: 'No GITHUB_PAT configured and no local file found.' });
    }

    // Fetch tracked-movies.json from GitHub
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ success: true, source: 'github', movies: [], message: `tracked-movies.json not found in repo (${res.status})` });
    }

    const fileData = await res.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    const movies = JSON.parse(content);

    // Also try to get state.json for runtime info (lastCheckTime, lastStatus, etc.)
    let stateMovies = [];
    try {
      const stateRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/${STATE_PATH}?ref=${BRANCH}`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      if (stateRes.ok) {
        const stateFileData = await stateRes.json();
        const stateContent = Buffer.from(stateFileData.content, 'base64').toString('utf8');
        const stateJson = JSON.parse(stateContent);
        stateMovies = stateJson.movies || [];
      }
    } catch {}

    // Merge runtime info from state.json into tracked-movies.json data
    const merged = movies.map(tm => {
      const stateEntry = stateMovies.find(sm =>
        sm.id === tm.id ||
        (sm.title?.toLowerCase() === tm.title?.toLowerCase() && (sm.region || '') === (tm.region || ''))
      );
      if (stateEntry) {
        return {
          ...tm,
          lastCheckTime: stateEntry.lastCheckTime || null,
          lastStatus: stateEntry.lastStatus || 'NOT_YET_LISTED',
          detectedTitle: stateEntry.detectedTitle || null,
          bookingUrl: stateEntry.bookingUrl || null,
          alertSent: stateEntry.alertSent || false,
          lastAlertSentTime: stateEntry.lastAlertSentTime || null,
        };
      }
      return tm;
    });

    return NextResponse.json({ success: true, source: 'github', movies: merged });
  } catch (error) {
    console.error('[SYNC:GET] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

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

