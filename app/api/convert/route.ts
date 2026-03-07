/** Proxies POST /api/convert to the Python backend. Requires auth; passes user_id for tracking. */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:5328";
const PROXY_TIMEOUT_MS = 15_000;
const YOUTUBE_TRANSCRIPT_API =
  process.env.YOUTUBE_TRANSCRIPT_API_URL ??
  "https://youtube-transcript-api-tau-one.vercel.app";
const YOUTUBE_FETCH_TIMEOUT_MS = 15_000;

import { createClient } from "@/lib/supabase/server";
import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";

/** True if the trimmed string is only a YouTube URL (and nothing else). */
function isOnlyYouTubeUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const ytRegex =
    /^(https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+|https?:\/\/youtu\.be\/[\w-]+)$/i;
  return ytRegex.test(trimmed);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ detail: "Unauthorized. Please sign in." }, { status: 401 });
  }

  const body = await request.json();
  let transcript: string = (body.transcript as string) ?? "";

  if (isOnlyYouTubeUrl(transcript)) {
    const videoUrl = transcript.trim();
    const ytController = new AbortController();
    const ytTimeoutId = setTimeout(
      () => ytController.abort(),
      YOUTUBE_FETCH_TIMEOUT_MS
    );
    try {
      const txRes = await fetch(`${YOUTUBE_TRANSCRIPT_API}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: videoUrl }),
        signal: ytController.signal,
      });
      clearTimeout(ytTimeoutId);
      const txData = (await txRes.json().catch(() => ({}))) as {
        transcript?: string;
        detail?: string;
      };
      if (!txRes.ok) {
        const message =
          txRes.status === 429
            ? "YouTube transcript service is rate limited. Please try again in a minute."
            : (txData.detail as string) ?? "No transcript available for this video.";
        return Response.json({ detail: message }, { status: 400 });
      }
      const fetchedTranscript = txData.transcript;
      if (typeof fetchedTranscript !== "string" || !fetchedTranscript.trim()) {
        return Response.json(
          { detail: "No transcript available for this video." },
          { status: 400 }
        );
      }
      body.transcript = fetchedTranscript;
    } catch (e) {
      clearTimeout(ytTimeoutId);
      console.error("[api/convert] YouTube transcript fetch error:", e);
      return Response.json(
        {
          detail:
            "Could not fetch transcript for this YouTube video. The video may be private, have no captions, or the service is temporarily unavailable.",
        },
        { status: 400 }
      );
    }
  }

  const payload = {
    ...body,
    userId: user.id,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    clearTimeout(timeoutId);
    if (res.status >= 500) {
      console.error("[api/convert] Backend error:", res.status, data);
      return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("[api/convert] Proxy error:", e);
    return Response.json({ detail: GENERIC_ERROR_MESSAGE }, { status: 502 });
  }
}
