import { NextResponse } from 'next/server';
import { getSettings, saveSettings, AppSettings } from '@/../lib/settings';

export async function GET() {
  try {
    const settings = getSettings();
    return NextResponse.json({
      settings: {
        githubToken: settings.githubToken || '',
        openaiApiKey: settings.openaiApiKey || '',
        openaiBaseUrl: settings.openaiBaseUrl || 'https://api.openai.com/v1',
        openaiModel: settings.openaiModel || 'gpt-4o-mini',
      },
    });
  } catch (error) {
    console.error('[Settings API] Failed to get settings:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppSettings>;
    const updated = saveSettings({
      githubToken: body.githubToken?.trim() || '',
      openaiApiKey: body.openaiApiKey?.trim() || '',
      openaiBaseUrl: body.openaiBaseUrl?.trim() || 'https://api.openai.com/v1',
      openaiModel: body.openaiModel?.trim() || 'gpt-4o-mini',
    });

    return NextResponse.json({
      success: true,
      settings: updated,
    });
  } catch (error) {
    console.error('[Settings API] Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
