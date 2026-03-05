import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "";

/**
 * Auth callback route for magic link / OAuth redirects.
 * Supabase redirects here with ?code=xxx (PKCE) or ?token_hash=xxx&type=email.
 * We exchange for a session and set cookies, then redirect to /.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (url && key) {
    const cookieStore = await cookies();

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in some contexts
          }
        },
      },
    });

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "email",
      });
      if (!error) {
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    }
  }

  // Auth failed or missing params; redirect to login
  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
