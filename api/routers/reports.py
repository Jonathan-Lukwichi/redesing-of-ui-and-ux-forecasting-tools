"""On-demand operations report delivery.

  POST /api/reports/email — email a client-built PDF report with a short
  AI-written, personally-addressed cover note describing what's inside.

The PDF itself is built in the browser (see src/utils/buildReportPdf.js) from
data the frontend already fetched via existing read-only "last materialized
result" endpoints — this router never recomputes a forecast/optimization/etc,
it only writes the cover note and sends the email. Thin by design; the
Resend call lives in core/notify.py.

The greeting and sign-off are templated deterministically here (never left to
the model) so a recipient's name is always inserted correctly and the sign-off
never varies; the AI is only responsible for the subject line and the section
content in between — see ai/prompts.py's report_email_note() for the exact
output contract this router parses.
"""
from __future__ import annotations
import html
import json
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from ai import config, client as ai_client, prompts, redact, audit
from core import notify

router = APIRouter(prefix="/api/reports", tags=["reports"])

_SURFACE = "report_email"
_SECTION_RE = re.compile(r"^##\s*(.+?)\s*$", re.MULTILINE)
_CLOSING_RE = re.compile(r"^CLOSING:\s*(.+)$", re.MULTILINE | re.IGNORECASE)


def _parse_note(raw: str) -> tuple[str, list[tuple[str, str]], str]:
    """Split the model's raw reply into (subject, [(title, body), ...], closing).
    Tolerant of the model deviating from the contract: falls back to a
    generated subject, and returns no sections (just the raw text as closing)
    if the '## '/CLOSING: markers aren't found at all."""
    lines = raw.strip().splitlines()
    subject = None
    body_start = 0
    for i, line in enumerate(lines):
        m = re.match(r"^SUBJECT:\s*(.+)$", line.strip(), re.IGNORECASE)
        if m:
            subject = m.group(1).strip()
            body_start = i + 1
            break
    if not subject:
        subject = f"HealthForecast Operations Report — {datetime.now():%d %B %Y}"

    rest = "\n".join(lines[body_start:]).strip()

    closing = ""
    cm = _CLOSING_RE.search(rest)
    if cm:
        closing = cm.group(1).strip()
        rest = rest[:cm.start()].strip()  # drop the CLOSING line before section-splitting

    matches = list(_SECTION_RE.finditer(rest))
    if not matches:
        return subject, [], (closing or rest)

    sections: list[tuple[str, str]] = []
    for idx, m in enumerate(matches):
        title = m.group(1).strip()
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(rest)
        body = rest[start:end].strip()
        if body:
            sections.append((title, body))

    # The model reliably puts its closing sentence as a blank-line-separated
    # trailing paragraph after the last section's content, even when it
    # skips the literal 'CLOSING:' marker — use that as a backstop so the
    # closing line still gets its own paragraph instead of being swallowed
    # into the last section.
    if not closing and sections:
        last_title, last_body = sections[-1]
        parts = last_body.rsplit("\n\n", 1)
        if len(parts) == 2:
            sections[-1] = (last_title, parts[0].strip())
            closing = parts[1].strip()

    return subject, sections, closing


_FIXED_ORDER = ["Overview", "Analysis", "Forecast", "Optimization", "Recommendations"]


def _compose_html(recipient_name: str | None, sections: list[tuple[str, str]], closing: str) -> str:
    greeting = html.escape(f"Hi {recipient_name.strip()}," if recipient_name and recipient_name.strip() else "Hi there,")
    ordered = sorted(sections, key=lambda s: _FIXED_ORDER.index(s[0]) if s[0] in _FIXED_ORDER else 99)
    body_parts = [
        f"<h3 style='margin:18px 0 4px;font-family:sans-serif;font-size:15px;color:#0f172a'>{html.escape(title)}</h3>"
        f"<p style='margin:0 0 4px;font-family:sans-serif;font-size:14px;color:#334155;line-height:1.5'>{html.escape(body)}</p>"
        for title, body in ordered
    ]
    closing_html = (
        f"<p style='margin:18px 0 0;font-family:sans-serif;font-size:14px;color:#334155'>{html.escape(closing)}</p>"
        if closing else ""
    )
    return (
        f"<p style='font-family:sans-serif;font-size:14px;color:#0f172a'>{greeting}</p>"
        + "".join(body_parts)
        + closing_html
        + "<p style='margin-top:22px;font-family:sans-serif;font-size:14px;color:#0f172a'>"
          "Kind regards,<br>HealthForecast Analyst</p>"
    )


class ReportEmailRequest(BaseModel):
    to: EmailStr
    pdf_base64: str
    context: dict[str, Any]
    recipient_name: str | None = None


@router.post("/email")
def email_report(body: ReportEmailRequest) -> dict[str, Any]:
    model = config.pick_model(_SURFACE)
    system = prompts.report_email_note()
    content = json.dumps(body.context)[:6000]  # same defensive cap as chat context

    raw = ""
    usage_in = usage_out = 0
    try:
        for kind, payload in ai_client.stream_text(system, content, model=model, max_tokens=400):
            if kind == "delta":
                raw += payload
            elif kind == "usage":
                usage_in, usage_out = payload["in"], payload["out"]
    except ai_client.AIError:
        raw = ""
    except Exception:
        raw = ""

    raw = redact.scrub(raw)
    if raw.strip():
        subject, sections, closing = _parse_note(raw)
    else:
        subject = f"HealthForecast Operations Report — {datetime.now():%d %B %Y}"
        sections, closing = [], "Your HealthForecast operations report is attached."

    html_body = _compose_html(body.recipient_name, sections, closing)

    sent = notify.send_email(
        to=body.to,
        subject=subject,
        html=html_body,
        attachment_pdf_b64=body.pdf_base64,
    )

    audit.log_event(_SURFACE, model, content, raw, usage_in, usage_out,
                     extra={"sent": sent, "subject": subject})

    return {"sent": sent, "subject": subject, "note": html_body}
