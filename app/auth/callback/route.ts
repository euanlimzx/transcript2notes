import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "";

function isAllowedEmail(email: string | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return (
    domain.endsWith(".edu") ||
    domain === "gmail.com" ||
    domain === "googlemail.com"
  );
}

/**
 * Auth callback route for magic link / OAuth redirects.
 * Supabase redirects here with ?code=xxx (PKCE) or ?token_hash=xxx&type=email.
 * We exchange for a session, enforce Gmail/.edu, then redirect to /.
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
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data?.user) {
        if (!isAllowedEmail(data.user.email)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            new URL("/login?error=email_domain", requestUrl.origin)
          );
        }
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    } else if (tokenHash && type) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "email",
      });
      if (!error && data?.user) {
        if (!isAllowedEmail(data.user.email)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            new URL("/login?error=email_domain", requestUrl.origin)
          );
        }
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    }
  }

  // Auth failed or missing params; redirect to login
  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
