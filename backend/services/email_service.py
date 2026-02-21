"""Resend email wrapper for sending alert digests."""

import logging

import resend

from backend.config import RESEND_API_KEY, RESEND_FROM_EMAIL

logger = logging.getLogger(__name__)


def _ensure_configured():
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not set — cannot send emails")
    resend.api_key = RESEND_API_KEY


async def send_email(
    to_emails: list[str],
    subject: str,
    html_content: str,
) -> dict:
    """Send an email via Resend. Returns the Resend response dict."""
    _ensure_configured()

    params: resend.Emails.SendParams = {
        "from": RESEND_FROM_EMAIL,
        "to": to_emails,
        "subject": subject,
        "html": html_content,
    }

    logger.info("Sending email to %s: %s", to_emails, subject)
    response = resend.Emails.send(params)
    logger.info("Email sent: %s", response)
    return response
