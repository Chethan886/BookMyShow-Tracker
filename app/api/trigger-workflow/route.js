import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'Chethan886/BookMyShow-Tracker';

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error:
            'GITHUB_TOKEN or GITHUB_PAT is not set in environment variables. You can still use the "Check Live Now" button directly on this website, or trigger the workflow on GitHub Actions.',
          directUrl: `https://github.com/${repo}/actions`,
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const testAlert = Boolean(body.test_alert);
    const forceAlert = Boolean(body.force_alert);

    const res = await axios.post(
      `https://api.github.com/repos/${repo}/actions/workflows/tracker.yml/dispatches`,
      {
        ref: 'main',
        inputs: {
          test_alert: String(testAlert),
          force_alert: String(forceAlert),
        },
      },
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: 'GitHub Actions workflow triggered successfully!',
      status: res.status,
    });
  } catch (error) {
    const status = error.response ? error.response.status : 500;
    const msg = error.response?.data?.message || error.message;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

