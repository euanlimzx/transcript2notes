"""LLM client for Gemini API. Used by topic extraction, boundary detection, and notes generation."""
from google import genai
from google.genai import types


def complete(
    system_prompt: str,
    user_content: str,
    model: str,
    api_key: str | None = None,
) -> str:
    """
    Call Gemini with system instruction and user content; return response text.
    Uses GEMINI_API_KEY or GOOGLE_API_KEY from env if api_key is None.
    """
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0,
        ),
    )
    return (response.text or "").strip()
