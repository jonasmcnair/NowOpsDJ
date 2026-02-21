import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    const redirectUrl = new URL('/', process.env.NEXTAUTH_URL!);
    redirectUrl.searchParams.set('auth_error', error || 'no_code');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const nextAuthUrl = process.env.NEXTAUTH_URL;

    if (!clientId || !clientSecret || !nextAuthUrl) {
      return new NextResponse(`Missing env vars: CLIENT_ID=${!!clientId} SECRET=${!!clientSecret} URL=${!!nextAuthUrl}`, { status: 500 });
    }

    const redirectUri = `${nextAuthUrl}/api/callback`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new NextResponse(`Token exchange failed: ${errText}`, { status: 500 });
    }

    const tokens = await tokenRes.json();

    const userRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return new NextResponse('Failed to get user profile', { status: 500 });
    }

    const user = await userRes.json();

    const redirectUrl = new URL('/', nextAuthUrl);
    redirectUrl.searchParams.set('access_token', tokens.access_token);
    redirectUrl.searchParams.set('refresh_token', tokens.refresh_token);
    redirectUrl.searchParams.set('expires_at', String(Date.now() + tokens.expires_in * 1000));
    redirectUrl.searchParams.set('user_id', user.id);
    redirectUrl.searchParams.set('display_name', user.display_name || 'DJ');

    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new NextResponse(`Callback error: ${msg}`, { status: 500 });
  }
}
