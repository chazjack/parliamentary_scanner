"""Application configuration loaded from environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(PROJECT_ROOT / "backend" / "parly_monitor.db")))

# Parliament API base URLs
HANSARD_API_BASE = "https://hansard-api.parliament.uk"
WRITTEN_QS_API_BASE = "https://questions-statements-api.parliament.uk"
EDM_API_BASE = "https://oralquestionsandmotions-api.parliament.uk"
BILLS_API_BASE = "https://bills-api.parliament.uk"
DIVISIONS_API_BASE = "https://commonsvotes-api.parliament.uk"
MEMBERS_API_BASE = "https://members-api.parliament.uk"
WHATSON_API_BASE = "https://whatson-api.parliament.uk"
COMMITTEES_API_BASE = "https://committees-api.parliament.uk"

# Look Ahead cache
LOOKAHEAD_CACHE_TTL = 86400  # seconds (24 hours)

# Rate limiting
REQUEST_DELAY = 0.2  # seconds between Parliament API calls
CLASSIFIER_DELAY = 0.1  # seconds between Anthropic API calls
KEYWORD_PARALLELISM = int(os.getenv("KEYWORD_PARALLELISM", "12"))  # max concurrent keyword searches

# Email (Resend)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "Parliamentary Monitor <alerts@updates.example.com>")
