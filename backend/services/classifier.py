"""LLM classification pipeline using Claude Haiku 4.5 with prompt caching.

Adapted from v1 classifier.py — now async, with prompt caching, expanded output
fields, and pre-filtering.
"""

import asyncio
import json
import logging
import re

import anthropic

from backend.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, CLASSIFIER_DELAY
from backend.services.parliament import Contribution

logger = logging.getLogger(__name__)

# Procedural patterns to pre-filter before sending to LLM
PROCEDURAL_PATTERNS = [
    r"^(the|this) (question|bill|motion) (is|was) (put|agreed|negatived|read)",
    r"^I refer the (honourable|right honourable|hon\.) (member|gentleman|lady)",
    r"^(ordered|resolved),? that",
    r"^(question|bill) (accordingly|put) (and )?agreed",
    r"^the (deputy )?(speaker|chairman|chair) ",
    r"^I beg to move",
    r"^(clause|amendment|new clause) \d+ (read|ordered)",
]
PROCEDURAL_RE = re.compile("|".join(PROCEDURAL_PATTERNS), re.IGNORECASE)

SYSTEM_PROMPT_TEMPLATE = """\
You are an expert analyst supporting the Ada Lovelace Institute's parliamentary \
engagement work. The Ada Lovelace Institute is an independent research institute \
focused on ensuring data and AI work for people and society. Their areas of focus \
include AI regulation and governance, data rights, biometrics, online safety, \
and the societal impacts of AI.

You are classifying UK parliamentary contributions to identify MPs and Peers \
whose activity signals a position or interest on policy topics relevant to Ada's \
mission. These results will be used to determine:
- Which parliamentarians to approach when Ada publishes new research
- Who to seek out to provide tailored briefings to ahead of parliamentary debates, \
questions or other activity
- Which parliamentary assistants of MPs to develop relationships with

Topics being monitored:
{topics_with_keywords}

Classify each contribution and respond ONLY with valid JSON (no markdown, \
no code fences):
{{
  "is_relevant": true or false,
  "confidence": "High" or "Medium" or "Low",
  "topics": ["topic1", "topic2"],
  "summary": "One sentence summarising the MP's position or action.",
  "position_signal": "What this reveals about the MP's stance on the topic.",
  "verbatim_quote": "Up to 3 sentences verbatim from the text, or a description of the action."
}}

Rules:
- Only mark relevant if the contribution reveals a substantive position or interest \
area, asks a meaningful policy question, or takes a notable action (signing an EDM, \
sponsoring a bill, voting in a relevant division). This can be implicit as well as \
explicit.
- Procedural mentions are NOT relevant (e.g. bill titles read by Speaker, \
"I refer the honourable member to...", boilerplate question headers).
- Generic mentions of a keyword without revealing a position are NOT relevant.
- The summary must capture the MP's POSITION or VIEW, not just that they mentioned the topic.
- The verbatim_quote must be copied exactly from the provided text — do not paraphrase.
- For actions (EDM signatures, bill sponsorship, votes), describe the action in verbatim_quote.
- If not relevant, set is_relevant to false and other fields to null.\
"""

SOURCE_TYPE_LABELS = {
    "hansard": "Oral contribution in debate",
    "written_question": "Written parliamentary question",
    "written_statement": "Written ministerial statement",
    "edm": "Early Day Motion",
    "bill": "Bill sponsorship",
    "division": "Division vote",
}


def truncate_text(text: str, max_words: int = 500) -> str:
    """Truncate to max_words: first 300 + last 200 if longer."""
    words = text.split()
    if len(words) <= max_words:
        return text
    first = " ".join(words[:300])
    last = " ".join(words[-200:])
    return f"{first}\n[...]\n{last}"


def is_procedural(text: str, source_type: str = "") -> bool:
    """Check if text is purely procedural.

    Hansard contributions get a lower word threshold because brief oral
    interventions (questions, interjections) can be substantive even when short.
    """
    stripped = text.strip()
    min_words = 5 if source_type == "hansard" else 8
    if len(stripped.split()) < min_words:
        return True
    return bool(PROCEDURAL_RE.match(stripped))


class TopicClassifier:
    """Async classifier using Claude Haiku 4.5 with prompt caching."""

    def __init__(self, topics_with_keywords: dict[str, list[str]]):
        self.client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        self.model = ANTHROPIC_MODEL

        # Build system prompt with topics
        topics_str = ""
        for topic, keywords in topics_with_keywords.items():
            topics_str += f"- {topic}: {', '.join(keywords)}\n"

        self.system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            topics_with_keywords=topics_str
        )

    async def classify(self, contribution: Contribution) -> dict | None:
        """Classify a single contribution. Returns dict if relevant, None otherwise.

        Uses prompt caching on the system prompt for cost efficiency.
        """
        text = truncate_text(contribution.text)
        source_label = SOURCE_TYPE_LABELS.get(
            contribution.source_type, contribution.source_type
        )

        user_message = (
            f"Speaker: {contribution.member_name}\n"
            f"Date: {contribution.date.strftime('%d/%m/%Y')}\n"
            f"Type: {source_label}\n"
            f"Context: {contribution.context}\n"
            f"Text:\n{text}"
        )

        for attempt in range(3):
            try:
                response = await self.client.messages.create(
                    model=self.model,
                    max_tokens=500,
                    system=[
                        {
                            "type": "text",
                            "text": self.system_prompt,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    messages=[{"role": "user", "content": user_message}],
                )

                result_text = response.content[0].text.strip()

                # Handle markdown code fences
                if result_text.startswith("```"):
                    result_text = result_text.split("\n", 1)[-1]
                    result_text = result_text.rsplit("```", 1)[0]

                parsed = json.loads(result_text)

                if not parsed.get("is_relevant"):
                    return None

                return {
                    "confidence": parsed.get("confidence", "Medium"),
                    "topics": parsed.get("topics", []),
                    "summary": parsed.get("summary", ""),
                    "position_signal": parsed.get("position_signal", ""),
                    "verbatim_quote": parsed.get("verbatim_quote", ""),
                }

            except json.JSONDecodeError:
                logger.warning(
                    "Invalid JSON from LLM for %s (attempt %d): %.200s",
                    contribution.id, attempt + 1, result_text,
                )
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                return None

            except anthropic.RateLimitError:
                wait = 2 ** (attempt + 2)
                logger.warning("Anthropic rate limited, waiting %ds", wait)
                await asyncio.sleep(wait)
                continue

            except anthropic.APIError as e:
                logger.error("Anthropic API error for %s: %s", contribution.id, e)
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return None

        return None
