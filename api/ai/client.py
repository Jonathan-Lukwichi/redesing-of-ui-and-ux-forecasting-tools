"""Provider wrapper around the Anthropic SDK.

The ONLY place the Anthropic SDK is imported. Uses the OS trust store
(truststore) so it works behind TLS-inspecting corporate networks, the same as
core/data_source.py.
"""
from __future__ import annotations
import ssl
from functools import lru_cache
from typing import Iterator

import httpx

from ai import config

try:
    import truststore
    _SSL_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except ImportError:  # pragma: no cover
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class AIError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client():
    import anthropic
    key = config.api_key()
    if not key:
        raise AIError("ANTHROPIC_API_KEY is not set in api/.env.")
    http = httpx.Client(verify=_SSL_CONTEXT, timeout=httpx.Timeout(120.0, connect=20.0))
    return anthropic.Anthropic(api_key=key, http_client=http)


def stream_text(system: str, user_content: str, model: str, max_tokens: int = 700):
    """Stream the model's reply as text chunks. Yields ('delta', text) tuples,
    then a final ('usage', {in,out}) tuple once complete."""
    client = _client()
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        for text in stream.text_stream:
            yield ("delta", text)
        final = stream.get_final_message()
        yield ("usage", {
            "in":  final.usage.input_tokens,
            "out": final.usage.output_tokens,
        })
