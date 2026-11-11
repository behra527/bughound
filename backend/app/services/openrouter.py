
import json
import logging
import time
from typing import Any

import httpx

from app.core.config import settings


logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MAX_ATTEMPTS = 3
BASE_RETRY_DELAY = 1.0
MAX_RETRY_DELAY = 15.0

RETRYABLE_STATUS_CODES = {
    408,
    409,
    425,
    429,
    500,
    502,
    503,
    504,
}


class OpenRouterError(RuntimeError):
    """Raised when an OpenRouter request or response fails."""


def _get_retry_delay(response: httpx.Response, attempt: int) -> float:
    """Calculate retry delay using Retry-After when available."""

    retry_after = response.headers.get("Retry-After")

    if retry_after:
        try:
            return min(
                max(float(retry_after), 0.0),
                MAX_RETRY_DELAY,
            )
        except ValueError:
            logger.warning("Invalid Retry-After header received from OpenRouter")

    return min(
        BASE_RETRY_DELAY * (2 ** attempt),
        MAX_RETRY_DELAY,
    )


def _request_completion(
    payload: dict[str, Any],
    headers: dict[str, str],
) -> httpx.Response:
    """Execute OpenRouter request with bounded retries."""

    for attempt in range(MAX_ATTEMPTS):
        try:
            response = httpx.post(
                OPENROUTER_URL,
                headers=headers,
                json=payload,
                timeout=httpx.Timeout(90.0, connect=10.0),
            )

        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
            if attempt == MAX_ATTEMPTS - 1:
                raise OpenRouterError(
                    f"OpenRouter connection failed after {MAX_ATTEMPTS} attempts: "
                    f"{type(error).__name__}"
                ) from error

            delay = min(
                BASE_RETRY_DELAY * (2 ** attempt),
                MAX_RETRY_DELAY,
            )

            logger.warning(
                "OpenRouter connection failed; retrying in %.1f seconds "
                "(attempt %d/%d)",
                delay,
                attempt + 1,
                MAX_ATTEMPTS,
            )

            time.sleep(delay)
            continue

        if response.status_code in RETRYABLE_STATUS_CODES:
            if attempt == MAX_ATTEMPTS - 1:
                response.raise_for_status()

            delay = _get_retry_delay(response, attempt)

            logger.warning(
                "OpenRouter returned HTTP %d; retrying in %.1f seconds "
                "(attempt %d/%d)",
                response.status_code,
                delay,
                attempt + 1,
                MAX_ATTEMPTS,
            )

            time.sleep(delay)
            continue

        response.raise_for_status()
        return response

    raise OpenRouterError("OpenRouter request exhausted retry attempts")


def ask_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    *,
    max_tokens: int = 5000,
) -> dict[str, Any]:
    """
    Request a structured JSON response from OpenRouter.

    Uses bounded retries for transient connection and HTTP errors.
    Validates the basic response structure and JSON object type.
    """

    if not settings.openrouter_api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured")

    if not settings.openrouter_model:
        raise OpenRouterError("OPENROUTER_MODEL is not configured")

    if max_tokens <= 0:
        raise OpenRouterError("max_tokens must be greater than zero")

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.public_api_url,
        "X-Title": "BugHound AI",
    }

    payload = {
        "model": settings.openrouter_model,
        "temperature": 0.1,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": json.dumps(
                    user_payload,
                    ensure_ascii=True,
                ),
            },
        ],
    }

    try:
        response = _request_completion(payload, headers)
        response_data = response.json()

        if not isinstance(response_data, dict):
            raise OpenRouterError(
                "OpenRouter returned an invalid response object"
            )

        choices = response_data.get("choices")

        if not isinstance(choices, list) or not choices:
            raise OpenRouterError(
                "OpenRouter response contains no completion choices"
            )

        choice = choices[0]

        if not isinstance(choice, dict):
            raise OpenRouterError(
                "OpenRouter returned an invalid completion choice"
            )

        if choice.get("finish_reason") == "length":
            raise OpenRouterError(
                f"Model response was truncated at max_tokens={max_tokens}"
            )

        message = choice.get("message")

        if not isinstance(message, dict):
            raise OpenRouterError(
                "OpenRouter response contains no valid message"
            )

        content = message.get("content")

        if not isinstance(content, str) or not content.strip():
            raise OpenRouterError(
                "OpenRouter returned empty or non-text content"
            )

        result = json.loads(content)

        if not isinstance(result, dict):
            raise OpenRouterError(
                "Expected a JSON object from the model"
            )

        return result

    except OpenRouterError:
        raise

    except httpx.HTTPStatusError as error:
        request_id = error.response.headers.get(
            "x-request-id",
            "unknown",
        )

        raise OpenRouterError(
            f"OpenRouter HTTP error: "
            f"status={error.response.status_code}, "
            f"request_id={request_id}"
        ) from error

    except httpx.HTTPError as error:
        raise OpenRouterError(
            f"OpenRouter network error: {type(error).__name__}"
        ) from error

    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise OpenRouterError(
            f"Invalid OpenRouter response: {type(error).__name__}"
        ) from error
