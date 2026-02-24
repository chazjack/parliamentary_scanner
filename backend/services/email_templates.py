"""HTML email templates for alert digests."""

from datetime import datetime, timedelta
from urllib.parse import quote


def _fmt_date_ddmmyy(date_str: str) -> str:
    """Convert YYYY-MM-DD to DD/MM/YY."""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%d/%m/%y")
        except ValueError:
            continue
    return date_str


def _fmt_date_range_header(start: str, end: str) -> str:
    """Format scan date range as 'X Jan to X Feb YYYY' for the header."""
    try:
        s = datetime.strptime(start, "%Y-%m-%d")
        e = datetime.strptime(end, "%Y-%m-%d")
        if s.year == e.year:
            return f"{s.day} {s.strftime('%b')} to {e.day} {e.strftime('%b')} {e.year}"
        return f"{s.day} {s.strftime('%b')} {s.year} to {e.day} {e.strftime('%b')} {e.year}"
    except ValueError:
        return f"{start} to {end}"


def _google_cal_url(ev: dict) -> str:
    """Build a Google Calendar 'add event' URL from event fields."""
    title = ev.get("title", "Parliamentary Event")
    date_str = ev.get("start_date", "")
    time_str = ev.get("start_time", "")
    location = ev.get("location", "")
    house = ev.get("house", "")
    source_url = ev.get("source_url", "")

    if not date_str:
        return ""

    try:
        date = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return ""

    if time_str:
        try:
            parts = time_str.split(":")
            hour, minute = int(parts[0]), int(parts[1])
            start_dt = date.replace(hour=hour, minute=minute)
            end_dt = start_dt + timedelta(hours=1)
            dates = f"{start_dt.strftime('%Y%m%dT%H%M%S')}/{end_dt.strftime('%Y%m%dT%H%M%S')}"
        except (ValueError, IndexError):
            dates = f"{date.strftime('%Y%m%d')}/{date.strftime('%Y%m%d')}"
    else:
        dates = f"{date.strftime('%Y%m%d')}/{date.strftime('%Y%m%d')}"

    loc_parts = [p for p in [location, house] if p]
    loc_str = ", ".join(loc_parts) if loc_parts else "UK Parliament"

    details = "Parliamentary event. "
    if source_url:
        details += f"More details: {source_url}"

    params = (
        f"action=TEMPLATE"
        f"&text={quote(title)}"
        f"&dates={dates}"
        f"&location={quote(loc_str)}"
        f"&details={quote(details.strip())}"
    )
    return f"https://calendar.google.com/calendar/render?{params}"


def _base_template(title: str, body: str, alert_name: str = "", date_range: str = "") -> str:
    """Wrap body content in the shared email layout."""
    return f"""<!DOCTYPE html>
<html lang="en" style="background:#000000;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="only dark">
<meta name="supported-color-schemes" content="only dark">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {{ color-scheme: only dark; }}
  body {{ font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000 !important; color: #a1a1aa !important; }}
  .container {{ max-width: 680px; margin: 0 auto; background-color: #0c0c0e !important; }}
  .header {{ padding: 24px 32px; border-bottom: 1px solid #1c1c1f; background-color: #0c0c0e !important; }}
  .logo-title {{ font-size: 28px; font-weight: 700; color: #e4e4e7; letter-spacing: -0.02em; }}
  .header-meta {{ margin-top: 16px; }}
  .header-meta h1 {{ margin: 0 0 4px; font-size: 24px; font-weight: 700; color: #e4e4e7; letter-spacing: -0.02em; }}
  .content {{ padding: 24px 32px; background-color: #0c0c0e !important; }}
  .topics-row {{ margin-bottom: 20px; }}
  .topics-label {{ font-size: 10px; font-weight: 600; color: #52525b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }}
  .result-card {{ background-color: #0c0c0e !important; border: 1px solid #1c1c1f; border-radius: 8px; padding: 16px; margin-bottom: 10px; }}
  .result-card .member {{ font-weight: 600; font-size: 14px; color: #e4e4e7; }}
  .result-card .meta {{ color: #71717a; font-size: 12px; margin: 4px 0 10px; }}
  .result-card .topics-row {{ margin-bottom: 8px; }}
  .result-card .summary {{ font-size: 13px; line-height: 1.6; color: #a1a1aa; }}
  .result-card .quote {{ font-style: italic; color: #71717a; font-size: 12px; margin-top: 10px; padding-left: 12px; border-left: 2px solid #27272a; line-height: 1.5; }}
  .topic-pill {{ display: inline-block; background-color: #13121e !important; color: #818cf8; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-right: 4px; margin-bottom: 2px; border: 1px solid #22214a; font-weight: 500; }}
  .event-row {{ border-bottom: 1px solid #18181b; padding: 12px 0; }}
  .event-row:last-child {{ border-bottom: none; }}
  .event-type {{ display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500; margin-bottom: 4px; }}
  .event-type-debate {{ background-color: #0d1520 !important; color: #60a5fa; border: 1px solid #1a2a40; }}
  .event-type-oral_questions {{ background-color: #1f1307 !important; color: #fb923c; border: 1px solid #3d2410; }}
  .event-type-committee {{ background-color: #0d1a0e !important; color: #4ade80; border: 1px solid #1a3320; }}
  .event-type-bill_stage {{ background-color: #1a0d0d !important; color: #f87171; border: 1px solid #331818; }}
  .event-type-westminster_hall {{ background-color: #160d1a !important; color: #c084fc; border: 1px solid #2c1a33; }}
  .event-type-statement {{ background-color: #0d1818 !important; color: #22d3ee; border: 1px solid #1a3030; }}
  .event-type-general_committee {{ background-color: #1a1507 !important; color: #fbbf24; border: 1px solid #332910; }}
  .event-title {{ font-size: 13px; font-weight: 600; color: #e4e4e7; display: block; margin-top: 2px; }}
  .event-meta {{ font-size: 12px; color: #71717a; margin-top: 3px; }}
  .cal-btn {{ display: inline-block; margin-top: 8px; padding: 3px 10px; background-color: #18181b !important; border: 1px solid #27272a; border-radius: 4px; font-size: 11px; color: #a1a1aa !important; text-decoration: none; }}
  .date-header {{ font-size: 11px; font-weight: 600; color: #71717a; margin: 20px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #27272a; text-transform: uppercase; letter-spacing: 0.06em; }}
  .date-header:first-child {{ margin-top: 0; }}
  a {{ color: #818cf8; text-decoration: none; }}
  a:hover {{ color: #a5b4fc; }}
  .footer {{ padding: 16px 32px; font-size: 11px; color: #3f3f46; border-top: 1px solid #18181b; line-height: 1.6; background-color: #0c0c0e !important; }}
  .empty-msg {{ color: #52525b; font-style: italic; padding: 20px 0; font-size: 13px; }}
  .divider {{ border: none; border-top: 1px solid #18181b; margin: 20px 0; }}
</style>
</head>
<body style="background-color:#000000 !important;color:#a1a1aa !important;margin:0;padding:0;">
<div class="container" style="max-width:680px;margin:0 auto;background-color:#0c0c0e !important;">
  <div class="header" style="padding:24px 32px;border-bottom:1px solid #1c1c1f;background-color:#0c0c0e !important;">
    <div style="display:flex;align-items:center;gap:14px;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="56" height="56">
        <rect x="30" y="45" width="60" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="105" y="45" width="65" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="30" y="78" width="80" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="125" y="78" width="45" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="30" y="111" width="50" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="95" y="111" width="75" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="30" y="144" width="70" height="18" rx="9" fill="#e4e4e7"/>
        <rect x="115" y="144" width="55" height="18" rx="9" fill="#e4e4e7"/>
      </svg>
      <span class="logo-title" style="font-size:28px;font-weight:700;color:#e4e4e7;letter-spacing:-0.02em;">ParliScan</span>
    </div>
    <div class="header-meta" style="margin-top:16px;">
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#e4e4e7;letter-spacing:-0.02em;">{title}</h1>
    </div>
  </div>
  <div class="content" style="padding:24px 32px;background-color:#0c0c0e !important;">
    {body}
  </div>
  <div class="footer" style="padding:16px 32px;font-size:11px;color:#3f3f46;border-top:1px solid #18181b;line-height:1.6;background-color:#0c0c0e !important;">
    Sent by ParliScan. To manage this alert, visit your alert settings.
  </div>
</div>
</body>
</html>"""


def _format_topics(topics_json: str) -> str:
    """Convert JSON topic list to pill HTML."""
    import json
    try:
        topics = json.loads(topics_json) if isinstance(topics_json, str) else topics_json
    except (json.JSONDecodeError, TypeError):
        return ""
    return " ".join(f'<span class="topic-pill">{t}</span>' for t in topics)


def scan_digest_html(
    alert_name: str,
    results: list[dict],
    scan_start: str,
    scan_end: str,
    topics: list[str],
) -> str:
    """Build HTML for a scan alert digest email."""
    topic_pills = " ".join(f'<span class="topic-pill">{t}</span>' for t in topics)
    date_range = _fmt_date_range_header(scan_start, scan_end)

    topics_section = f"""
    <div class="topics-row">
      <div class="topics-label">Topics</div>
      {topic_pills}
    </div>
    """

    if not results:
        body = topics_section + '<p class="empty-msg">No relevant parliamentary activity was found for your selected topics during this period.</p>'
        return _base_template(f"{alert_name}: No Activity", body, alert_name, date_range)

    cards = []
    for r in results:
        quote_html = ""
        if r.get("verbatim_quote"):
            quote_html = f'<div class="quote">{r["verbatim_quote"]}</div>'

        source_link = ""
        if r.get("source_url"):
            source_link = f' &middot; <a href="{r["source_url"]}">View source &rarr;</a>'

        topics_html = _format_topics(r.get("topics", "[]"))
        topics_row = f'<div class="topics-row" style="margin-bottom:8px;">{topics_html}</div>' if topics_html else ""

        activity_date = _fmt_date_ddmmyy(r.get("activity_date", ""))

        cards.append(f"""
        <div class="result-card" style="background-color:#0c0c0e !important;border:1px solid #1c1c1f;border-radius:8px;padding:16px;margin-bottom:10px;">
          <div class="member">{r.get("member_name", "Unknown")}</div>
          <div class="meta">
            {r.get("party", "")} &middot; {r.get("forum", "")} &middot; {activity_date}
            {source_link}
          </div>
          {topics_row}
          <div class="summary">{r.get("summary", "")}</div>
          {quote_html}
        </div>""")

    body = topics_section + "\n".join(cards)
    return _base_template(f"{alert_name}: {len(results)} Results", body, alert_name, date_range)


def lookahead_digest_html(
    alert_name: str,
    events: list[dict],
    start_date: str,
    end_date: str,
) -> str:
    """Build HTML for a lookahead alert digest email."""
    date_range = _fmt_date_range_header(start_date, end_date)

    if not events:
        body = '<p class="empty-msg">No upcoming parliamentary events were found matching your filters for this period.</p>'
        return _base_template(f"{alert_name}: No Events", body, alert_name, date_range)

    # Group events by date
    by_date: dict[str, list[dict]] = {}
    for ev in events:
        d = ev.get("start_date", "Unknown")
        by_date.setdefault(d, []).append(ev)

    sections = []
    for date_str in sorted(by_date.keys()):
        try:
            label = datetime.strptime(date_str, "%Y-%m-%d").strftime("%A %d %B")
        except ValueError:
            label = date_str
        sections.append(f'<div class="date-header">{label}</div>')

        for ev in by_date[date_str]:
            etype = ev.get("event_type", "debate")
            time_str = ev.get("start_time", "")
            if time_str:
                time_str = f"{time_str} &middot; "

            link = ""
            if ev.get("source_url"):
                link = f' &middot; <a href="{ev["source_url"]}">Details &rarr;</a>'

            house = ev.get("house", "")
            location = ev.get("location", "")
            loc_str = f" &middot; {location}" if location else ""

            cal_url = _google_cal_url(ev)
            cal_btn = (
                f'<a href="{cal_url}" class="cal-btn" style="display:inline-block;margin-top:8px;padding:3px 10px;background-color:#18181b !important;border:1px solid #27272a;border-radius:4px;font-size:11px;color:#a1a1aa !important;text-decoration:none;">+ Add to calendar</a>'
                if cal_url else ""
            )

            sections.append(f"""
            <div class="event-row">
              <span class="event-type event-type-{etype}">{etype.replace("_", " ").title()}</span>
              <span class="event-title">{ev.get("title", "")}</span>
              <div class="event-meta">
                {time_str}{house}{loc_str}{link}
              </div>
              {cal_btn}
            </div>""")

    body = "\n".join(sections)
    return _base_template(f"{alert_name}: {len(events)} Events", body, alert_name, date_range)
