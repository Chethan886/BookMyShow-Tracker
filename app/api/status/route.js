import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stateFilePath = path.resolve(process.cwd(), 'state.json');
  let state = {
    alertSent: false,
    lastCheckTime: null,
    lastStatus: 'INITIALIZED',
    detectedTitle: null,
    bookingUrl: 'https://in.bookmyshow.com/explore/movies-karwar',
    theaters: ['Miraj Cinemas: Geetanjali, Karwar'],
  };

  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, 'utf8');
      state = { ...state, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error reading state.json in status route:', err);
  }

  return NextResponse.json({
    success: true,
    state,
    region: process.env.BMS_REGION || 'karwar',
    target: 'Ramayana',
    serverTime: new Date().toISOString(),
  });
}

