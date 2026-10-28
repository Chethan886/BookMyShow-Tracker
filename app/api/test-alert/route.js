import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const { sendTestAlert } = require('../../../tracker');
    console.log('[API:TEST_ALERT] Test alert requested from frontend');
    const success = await sendTestAlert();

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Test alert sent successfully to Discord webhook!',
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Webhook dispatch failed. Check DISCORD_WEBHOOK_URL environment variable.',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[API:TEST_ALERT] Error sending test alert:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
