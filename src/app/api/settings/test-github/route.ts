import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getEffectiveGitHubToken } from '@/../lib/settings';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token?.trim() || getEffectiveGitHubToken();

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token tidak boleh kosong' },
        { status: 400 }
      );
    }

    const octokit = new Octokit({
      auth: token,
      userAgent: 'github-activity-trace',
    });

    const userRes = await octokit.users.getAuthenticated();
    const scopes = userRes.headers['x-oauth-scopes'] || '';

    return NextResponse.json({
      success: true,
      user: {
        login: userRes.data.login,
        name: userRes.data.name || userRes.data.login,
        avatar_url: userRes.data.avatar_url,
        scopes,
      },
    });
  } catch (error: any) {
    const status = error.status || 500;
    let message = error.message || 'Gagal menghubungi GitHub API';
    if (status === 401) {
      message = 'Token GitHub tidak valid atau sudah kedaluwarsa.';
    } else if (status === 403) {
      message = 'Akses ditolak atau rate limit terlampaui.';
    }

    return NextResponse.json(
      { success: false, message },
      { status: 200 } // Return 200 with success: false for cleaner client handling
    );
  }
}
