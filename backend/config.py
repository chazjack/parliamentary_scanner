"""Application configuration loaded from environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=True)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"

DATABASE_PATH = PROJECT_ROOT / "backend" / "parly_monitor.db"

# Parliament API base URLs
HANSARD_API_BASE = "https://hansard-api.parliament.uk"
WRITTEN_QS_API_BASE = "https://questions-statements-api.parliament.uk"
EDM_API_BASE = "https://oralquestionsandmotions-api.parliament.uk"
BILLS_API_BASE = "https://bills-api.parliament.uk"
DIVISIONS_API_BASE = "https://commonsvotes-api.parliament.uk"
MEMBERS_API_BASE = "https://members-api.parliament.uk"

# Rate limiting
REQUEST_DELAY = 0.2  # seconds between Parliament API calls
CLASSIFIER_DELAY = 0.1  # seconds between Anthropic API calls
