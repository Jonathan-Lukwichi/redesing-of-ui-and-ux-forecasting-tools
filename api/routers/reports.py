"""On-demand operations report delivery.

  POST /api/reports/email — email a client-built PDF report with a short
  AI-written plain-language cover note describing what's inside.

The PDF itself is built in the browser (see src/utils/buildReportPdf.js) from
data the frontend already fetched via existing read-only "last materialized
result" endpoints — this router never recomputes a forecast/optimization/etc,
it only writes the cover note and sends the email. Thin by design; the
Resend call lives in core/notify.py.
"""
from __future__ import annotations
import json
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from ai import config, client as ai_client, prompts, redact, audit
from core import notify

router = APIRouter(prefix="/api/reports", tags=["reports"])

_SURFACE = "report_email"

_COVER_NOTE_TASK = (
    "\n\nTASK: The user is emailing a colleague a PDF operations report built "
    "from this same context (an overview, analysis highlights, a forecast, "
    "optimization results, and recommended actions). Write a 3 to 5 sentence "
    "email cover note in plain prose describing what the attached report "
    "contains, in the same plain-language style. Do not restate every number "
    "already in the context — summarize what the reader will find."
)


class ReportEmailRequest(BaseModel):
    to: EmailStr
    pdf_base64: str
    context: dict[str, Any]


@router.post("/email")
def email_report(body: ReportEmailRequest) -> dict[str, Any]:
    model = config.pick_model(_SURFACE)
    system = prompts.GROUNDING + _COVER_NOTE_TASK
    content = json.dumps(body.context)[:6000]  # same defensive cap as chat context

    note = ""
    usage_in = usage_out = 0
    try:
        for kind, payload in ai_client.stream_text(system, content, model=model, max_tokens=300):
            if kind == "delta":
                note += payload
            elif kind == "usage":
                usage_in, usage_out = payload["in"], payload["out"]
    except ai_client.AIError:
        note = "Your HealthForecast operations report is attached."
    except Exception:
        note = "Your HealthForecast operations report is attached."

    note = redact.scrub(note)

    sent = notify.send_email(
        to=body.to,
        subject="HealthForecast — Operations Report",
        html=f"<p>{note}</p>",
        attachment_pdf_b64=body.pdf_base64,
    )

    audit.log_event(_SURFACE, model, content, note, usage_in, usage_out,
                     extra={"sent": sent})

    return {"sent": sent, "note": note}
