// app/api/callback/route.ts
// Handles Spotify OAuth2 callback, exchanges code for tokens

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getCurrentUser } from '@/lib/spotify';

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
    const tokens = await exchangeCodeForTokens(code);
    const user = await getCurrentUser(tokens.access_token);

    // Redirect back to app with tokens in URL params (simple approach)
    // In production, use httpOnly cookies or a server-side session store
    const redirectUrl = new URL('/', process.env.NEXTAUTH_URL!);
    redirectUrl.searchParams.set('access_token', tokens.access_token);
    redirectUrl.searchParams.set('refresh_token', tokens.refresh_token);
    redirectUrl.searchParams.set('expires_at', String(Date.now() + tokens.expires_in * 1000));
    redirectUrl.searchParams.set('user_id', user.id);
    redirectUrl.searchParams.set('display_name', user.display_name || 'DJ');

    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    console.error('OAuth callback error:', e);
    const redirectUrl = new URL('/', process.env.NEXTAUTH_URL!);
    redirectUrl.searchParams.set('auth_error', 'token_exchange_failed');
    return NextResponse.redirect(redirectUrl);
  }
}
