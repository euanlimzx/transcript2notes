"""LLM client: Gemini with 503 fallback to OpenAI. Used by topic extraction, boundary detection, and notes generation."""
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

from google import genai
from google.genai import types

logger = logging.getLogger("uvicorn")

# How much of request/response to log (chars); rest is replaced with "... (N more chars)"
LOG_REQUEST_MAX_CHARS = 600
LOG_RESPONSE_MAX_CHARS = 800

# Max seconds per LLM request; prevents indefinite hangs (e.g. 12+ min at "segmenting").
# 180s allows Gemini attempt + OpenAI fallback on 503.
LLM_TIMEOUT_SEC = 300

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
) -> str:
    """Call OpenAI Chat Completions with the same semantic (system + user)."""
    from openai import OpenAI

    openai_model = GEMINI_TO_OPENAI_MODEL.get(model, DEFAULT_OPENAI_MODEL)
    key = api_key or os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set; cannot fallback from Gemini 503")
    prefix = f" [{label}]" if label else ""
    logger.info(
        "OpenAI request%s: model=%s (mapped from %s), user_content_len=%d",
        prefix,
        openai_model,
        model,
        len(user_content),
    )
    t0 = time.perf_counter()
    client = OpenAI(api_key=key, timeout=LLM_TIMEOUT_SEC)
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
        "OpenAI response%s: ok, len=%d, elapsed=%.2fs",
        prefix,
        len(text),
        elapsed,
    )
    logger.info(
        "OpenAI response%s body:\n%s",
        prefix,
        _truncate(text, LOG_RESPONSE_MAX_CHARS),
    )
    return text


def _complete_impl(
    system_prompt: str,
    user_content: str,
    model: str,
    api_key: str | None,
    label: str,
) -> str:
    """Inner implementation: try Gemini, fallback to OpenAI on 503."""
    prefix = f" [{label}]" if label else ""
    logger.info(
        "Gemini request%s: model=%s, user_content_len=%d, system_prompt_len=%d",
        prefix,
        model,
        len(user_content),
        len(system_prompt),
    )
    logger.info(
        "Gemini request%s user_content:\n%s",
        prefix,
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
            "Gemini response%s: ok, len=%d, elapsed=%.2fs",
            prefix,
            len(text),
            elapsed,
        )
        logger.info(
            "Gemini response%s body:\n%s",
            prefix,
            _truncate(text, LOG_RESPONSE_MAX_CHARS),
        )
        return text
    except Exception as e:
        elapsed = time.perf_counter() - t0
        if _is_gemini_503_or_unavailable(e):
            logger.warning(
                "Gemini response%s: 503/unavailable after %.2fs, falling back to OpenAI: %s",
                prefix,
                elapsed,
                e,
            )
            return _complete_openai(
                system_prompt, user_content, model, api_key=api_key, label=label
            )
        logger.exception(
            "Gemini response%s: error after %.2fs: %s",
            prefix,
            elapsed,
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
) -> str:
    """
    Call Gemini with system instruction and user content; return response text.
    On 503 / UNAVAILABLE, retry that call with OpenAI and return OpenAI response.
    Uses GEMINI_API_KEY or GOOGLE_API_KEY from env if api_key is None.
    Enforces LLM_TIMEOUT_SEC per request to prevent indefinite hangs.
    """
    with ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(
            _complete_impl,
            system_prompt,
            user_content,
            model,
            api_key,
            label,
        )
        try:
            return future.result(timeout=LLM_TIMEOUT_SEC)
        except FuturesTimeoutError:
            logger.error(
                "LLM request timed out after %ds (label=%s). "
                "Check API keys, network, or try a shorter transcript.",
                LLM_TIMEOUT_SEC,
                label or "unknown",
            )
            raise RuntimeError(
                f"LLM request timed out after {LLM_TIMEOUT_SEC} seconds. "
                "The API may be slow or overloaded. Try again or use a shorter transcript."
            ) from None
