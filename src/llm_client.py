"""LLM client: Gemini with 503 fallback to OpenAI. Used by topic extraction, boundary detection, and notes generation."""
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

LLM_RETRY_ATTEMPTS = 3  # 1 initial + 2 retries
LLM_RETRY_DELAY_SEC = 8

from google import genai
from google.genai import types

logger = logging.getLogger("pipeline.llm")

# Shared executor for all LLM calls. Avoids creating a new executor (and thread) per call,
# which under load could accumulate threads and retain large payloads on timeout.
_LLM_EXECUTOR: ThreadPoolExecutor | None = None


def _get_llm_executor() -> ThreadPoolExecutor:
    global _LLM_EXECUTOR
    if _LLM_EXECUTOR is None:
        # Stage 2/3 use up to 10 concurrent requests; allow some headroom.
        _LLM_EXECUTOR = ThreadPoolExecutor(max_workers=12, thread_name_prefix="llm")
    return _LLM_EXECUTOR

# How much of request/response to log (chars); rest is replaced with "... (N more chars)"
LOG_REQUEST_MAX_CHARS = 600
LOG_RESPONSE_MAX_CHARS = 800

# Log request/response bodies (truncated) when set to "1".
# Keep this off by default to avoid flooding logs with transcript content.
LOG_LLM_BODIES = os.getenv("LLM_LOG_BODIES", "0") == "1"

# Max seconds per LLM request; prevents indefinite hangs (e.g. 12+ min at "segmenting").
# 600s allows long context (e.g. 90k chars); we retry up to 2 times on timeout/failure.
LLM_TIMEOUT_SEC = 600

# Map Gemini model names to OpenAI model for fallback on 503
GEMINI_TO_OPENAI_MODEL = {
    "gemini-3-flash-preview": "gpt-4o-mini",
    "gemini-2.0-flash": "gpt-4o-mini",
    "gemini-1.5-flash": "gpt-4o-mini",
    "gemini-1.5-pro": "gpt-4o",
}
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"


def _truncate(s: str, max_chars: int) -> str:
    s = (s or "").strip()
    if len(s) <= max_chars:
        return s
    return s[:max_chars] + f"... ({len(s) - max_chars} more chars)"


def _format_exc_status(exc: Exception) -> str:
    """
    Best-effort extraction of HTTP-ish status/code from SDK exceptions.
    Useful for distinguishing 429 vs 503 vs auth failures in logs.
    """
    code = getattr(exc, "code", None)
    status_code = getattr(exc, "status_code", None)
    # Some SDKs nest response objects.
    resp = getattr(exc, "response", None)
    resp_status = getattr(resp, "status_code", None) if resp is not None else None
    parts: list[str] = []
    if status_code is not None:
        parts.append(f"status_code={status_code}")
    if resp_status is not None:
        parts.append(f"response_status={resp_status}")
    if code is not None:
        parts.append(f"code={code}")
    return ", ".join(parts) if parts else "status=unknown"


def _is_gemini_503_or_unavailable(exc: Exception) -> bool:
    """True if the exception indicates 503 / overload / unavailable (should fallback to OpenAI)."""
    msg = str(exc).upper()
    if "503" in msg or "UNAVAILABLE" in msg:
        return True
    code = getattr(exc, "code", None)
    if code is not None and (code == 503 or code == 429):
        return True
    return False


def _complete_openai(
    system_prompt: str,
    user_content: str,
    model: str,
    api_key: str | None = None,
    *,
    label: str = "",
    trace_id: str = "",
) -> str:
    """Call OpenAI Chat Completions with the same semantic (system + user)."""
    from openai import OpenAI

    openai_model = GEMINI_TO_OPENAI_MODEL.get(model, DEFAULT_OPENAI_MODEL)
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set; cannot fallback from Gemini 503")
    prefix = f" [{label}]" if label else ""
    trace = f" trace={trace_id}" if trace_id else ""
    logger.info(
        "OpenAI request%s%s: model=%s (mapped from %s), user_content_len=%d",
        prefix,
        trace,
        openai_model,
        model,
        len(user_content),
    )
    if LOG_LLM_BODIES:
        logger.info(
            "OpenAI request%s%s user_content:\n%s",
            prefix,
            trace,
            _truncate(user_content, LOG_REQUEST_MAX_CHARS),
        )
    t0 = time.perf_counter()
    client = OpenAI(api_key=key, timeout=LLM_TIMEOUT_SEC)
    try:
        response = client.chat.completions.create(
            model=openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0,
        )
        elapsed = time.perf_counter() - t0
        text = (response.choices[0].message.content or "").strip()
        logger.info(
            "OpenAI response%s%s: ok, len=%d, elapsed=%.2fs",
            prefix,
            trace,
            len(text),
            elapsed,
        )
        if LOG_LLM_BODIES:
            logger.info(
                "OpenAI response%s%s body:\n%s",
                prefix,
                trace,
                _truncate(text, LOG_RESPONSE_MAX_CHARS),
            )
        return text
    except Exception as e:
        elapsed = time.perf_counter() - t0
        logger.exception(
            "OpenAI response%s%s: error after %.2fs (%s): %s",
            prefix,
            trace,
            elapsed,
            _format_exc_status(e),
            e,
        )
        raise


def _complete_impl(
    system_prompt: str,
    user_content: str,
    model: str,
    api_key: str | None,
    label: str,
    trace_id: str,
) -> str:
    """Inner implementation: try Gemini, fallback to OpenAI on 503."""
    prefix = f" [{label}]" if label else ""
    trace = f" trace={trace_id}" if trace_id else ""
    logger.info(
        "Gemini request%s%s: model=%s, user_content_len=%d, system_prompt_len=%d",
        prefix,
        trace,
        model,
        len(user_content),
        len(system_prompt),
    )
    if LOG_LLM_BODIES:
        logger.info(
            "Gemini request%s%s user_content:\n%s",
            prefix,
            trace,
            _truncate(user_content, LOG_REQUEST_MAX_CHARS),
        )
    t0 = time.perf_counter()
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0,
            ),
        )
        elapsed = time.perf_counter() - t0
        text = (response.text or "").strip()
        logger.info(
            "Gemini response%s%s: ok, len=%d, elapsed=%.2fs",
            prefix,
            trace,
            len(text),
            elapsed,
        )
        if LOG_LLM_BODIES:
            logger.info(
                "Gemini response%s%s body:\n%s",
                prefix,
                trace,
                _truncate(text, LOG_RESPONSE_MAX_CHARS),
            )
        return text
    except Exception as e:
        elapsed = time.perf_counter() - t0
        if _is_gemini_503_or_unavailable(e):
            logger.warning(
                "Gemini response%s%s: 503/unavailable after %.2fs (%s), falling back to OpenAI: %s",
                prefix,
                trace,
                elapsed,
                _format_exc_status(e),
                e,
            )
            return _complete_openai(
                system_prompt,
                user_content,
                model,
                api_key=api_key,
                label=label,
                trace_id=trace_id,
            )
        logger.exception(
            "Gemini response%s%s: error after %.2fs (%s): %s",
            prefix,
            trace,
            elapsed,
            _format_exc_status(e),
            e,
        )
        raise


def complete(
    system_prompt: str,
    user_content: str,
    model: str,
    api_key: str | None = None,
    *,
    label: str = "",
    trace_id: str = "",
) -> str:
    """
    Call Gemini with system instruction and user content; return response text.
    On 503 / UNAVAILABLE, retry that call with OpenAI and return OpenAI response.
    Uses GEMINI_API_KEY or GOOGLE_API_KEY from env if api_key is None.
    Enforces LLM_TIMEOUT_SEC per request; retries up to 2 times (3 attempts total) on timeout/failure.
    Uses a shared process-wide executor to avoid creating a new thread per call (memory/thread leak).
    """
    ex = _get_llm_executor()
    last_exc: BaseException | None = None
    for attempt in range(1, LLM_RETRY_ATTEMPTS + 1):
        future = ex.submit(
            _complete_impl,
            system_prompt,
            user_content,
            model,
            api_key,
            label,
            trace_id,
        )
        try:
            return future.result(timeout=LLM_TIMEOUT_SEC)
        except FuturesTimeoutError:
            future.cancel()
            last_exc = RuntimeError(
                f"LLM request timed out after {LLM_TIMEOUT_SEC} seconds. "
                "The API may be slow or overloaded. Try again or use a shorter transcript."
            )
            logger.error(
                "LLM request timed out after %ds (label=%s, trace=%s). "
                "Check API keys, network, or try a shorter transcript.",
                LLM_TIMEOUT_SEC,
                label or "unknown",
                trace_id or "",
            )
        except Exception as e:
            last_exc = e
            logger.exception(
                "LLM request failed (label=%s, trace=%s): %s",
                label or "unknown",
                trace_id or "",
                e,
            )
        if attempt < LLM_RETRY_ATTEMPTS:
            logger.warning(
                "LLM request failed (attempt %d/%d), retrying in %ds...",
                attempt,
                LLM_RETRY_ATTEMPTS,
                LLM_RETRY_DELAY_SEC,
            )
            time.sleep(LLM_RETRY_DELAY_SEC)
    raise last_exc from None
