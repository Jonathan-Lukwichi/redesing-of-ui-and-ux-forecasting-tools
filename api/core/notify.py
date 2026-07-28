"""Outbound transactional email. One thin wrapper so every caller (report
delivery today; access-request/weekly-digest notifications later, per
docs/email-automation-plan.md) shares one provider, one timeout, one failure
mode.

Uses the OS trust store (truststore) so it works behind TLS-inspecting
corporate networks, the same pattern as core/data_source.py and ai/client.py.
"""
from __future__ import annotations
import os
import ssl

import httpx

try:
    import truststore
    _SSL_CONTEXT = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except ImportError:  # pragma: no cover
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

_API_KEY = os.getenv("RESEND_API_KEY")
_FROM = os.getenv("NOTIFY_FROM_EMAIL", "onboarding@resend.dev")


def send_email(to: str, subject: str, html: str,
                attachment_pdf_b64: str | None = None,
                attachment_name: str = "report.pdf") -> bool:
    """Send one transactional email via Resend. Returns False (never raises)
    if the provider isn't configured or the send fails — callers decide how
    to degrade."""
    if not _API_KEY:
        return False
    payload = {"from": _FROM, "to": [to], "subject": subject, "html": html}
    if attachment_pdf_b64:
        payload["attachments"] = [{"filename": attachment_name, "content": attachment_pdf_b64}]
    try:
        with httpx.Client(verify=_SSL_CONTEXT, timeout=15) as c:
            r = c.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {_API_KEY}"},
                json=payload,
            )
            return r.status_code < 300
    except Exception:
        return False
