"""HTML email templates for alert digests."""

from datetime import datetime


def _base_template(title: str, body: str, alert_name: str = "") -> str:
    """Wrap body content in the shared email layout."""
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; color: #1a1a2e; }}
  .container {{ max-width: 700px; margin: 0 auto; background: #fff; }}
  .header {{ background: #1a1a2e; color: #fff; padding: 24px 32px; }}
  .header h1 {{ margin: 0; font-size: 20px; font-weight: 600; }}
  .header .subtitle {{ color: #a0a0b8; font-size: 13px; margin-top: 4px; }}
  .content {{ padding: 24px 32px; }}
  .summary-box {{ background: #f0f4ff; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }}
  .summary-box .stat {{ display: inline-block; margin-right: 24px; }}
  .summary-box .stat-num {{ font-size: 22px; font-weight: 700; color: #1a1a2e; }}
  .summary-box .stat-label {{ font-size: 12px; color: #666; display: block; }}
  .result-card {{ border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }}
  .result-card .member {{ font-weight: 600; font-size: 15px; }}
  .result-card .meta {{ color: #666; font-size: 12px; margin: 4px 0 8px; }}
  .result-card .summary {{ font-size: 14px; line-height: 1.5; }}
  .result-card .quote {{ font-style: italic; color: #444; font-size: 13px; margin-top: 8px; padding-left: 12px; border-left: 3px solid #ddd; }}
  .topic-pill {{ display: inline-block; background: #e8eaf6; color: #1a1a2e; font-size: 11px; padding: 2px 8px; border-radius: 12px; margin-right: 4px; }}
  .confidence-high {{ color: #2e7d32; font-weight: 600; }}
  .confidence-medium {{ color: #f57f17; font-weight: 600; }}
  .confidence-low {{ color: #999; }}
  .event-row {{ border-bottom: 1px solid #eee; padding: 12px 0; }}
  .event-row:last-child {{ border-bottom: none; }}
  .event-type {{ display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 500; }}
  .event-type-debate {{ background: #e3f2fd; color: #1565c0; }}
  .event-type-oral_questions {{ background: #fff3e0; color: #e65100; }}
  .event-type-committee {{ background: #e8f5e9; color: #2e7d32; }}
  .event-type-bill_stage {{ background: #fce4ec; color: #c62828; }}
  .event-type-westminster_hall {{ background: #f3e5f5; color: #6a1b9a; }}
  .event-type-statement {{ background: #e0f7fa; color: #00695c; }}
  .event-type-general_committee {{ background: #fff8e1; color: #f57f17; }}
  .date-header {{ font-size: 15px; font-weight: 600; color: #1a1a2e; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #1a1a2e; }}
  .date-header:first-child {{ margin-top: 0; }}
  a {{ color: #1565c0; }}
  .footer {{ padding: 16px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; }}
  .empty-msg {{ color: #666; font-style: italic; padding: 20px 0; }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>{title}</h1>
    <div class="subtitle">{alert_name} &mdash; {datetime.utcnow().strftime('%d %B %Y')}</div>
  </div>
  <div class="content">
    {body}
  </div>
  <div class="footer">
    Sent by Parliamentary Monitor. To manage this alert, visit your alert settings.<br>
    To unsubscribe, reply to this email with "unsubscribe" or remove your address from the alert settings.
  </div>
</div>
</body>
</html>"""


def _confidence_class(confidence: str) -> str:
    return f"confidence-{confidence.lower()}" if confidence else ""


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

    summary_box = f"""
    <div class="summary-box">
      <span class="stat"><span class="stat-num">{len(results)}</span><span class="stat-label">Relevant results</span></span>
      <span class="stat"><span class="stat-num">{scan_start} &ndash; {scan_end}</span><span class="stat-label">Period scanned</span></span>
    </div>
    <div style="margin-bottom:16px;">Topics: {topic_pills}</div>
    """

    if not results:
        body = summary_box + '<p class="empty-msg">No relevant parliamentary activity was found for your selected topics during this period.</p>'
        return _base_template("Scan Alert: No Activity", body, alert_name)

    cards = []
    for r in results:
        quote_html = ""
        if r.get("verbatim_quote"):
            quote_html = f'<div class="quote">{r["verbatim_quote"]}</div>'

        source_link = ""
        if r.get("source_url"):
            source_link = f' &middot; <a href="{r["source_url"]}">Source</a>'

        cards.append(f"""
        <div class="result-card">
          <div class="member">{r.get("member_name", "Unknown")}</div>
          <div class="meta">
            {r.get("party", "")} &middot; {r.get("forum", "")} &middot; {r.get("activity_date", "")}
            &middot; <span class="{_confidence_class(r.get("confidence", ""))}">{r.get("confidence", "")}</span>
            {source_link}
          </div>
          <div>{_format_topics(r.get("topics", "[]"))}</div>
          <div class="summary">{r.get("summary", "")}</div>
          {quote_html}
        </div>""")

    body = summary_box + "\n".join(cards)
    return _base_template(f"Scan Alert: {len(results)} Results", body, alert_name)


def lookahead_digest_html(
    alert_name: str,
    events: list[dict],
    start_date: str,
    end_date: str,
) -> str:
    """Build HTML for a lookahead alert digest email."""
    summary_box = f"""
    <div class="summary-box">
      <span class="stat"><span class="stat-num">{len(events)}</span><span class="stat-label">Upcoming events</span></span>
      <span class="stat"><span class="stat-num">{start_date} &ndash; {end_date}</span><span class="stat-label">Period</span></span>
    </div>
    """

    if not events:
        body = summary_box + '<p class="empty-msg">No upcoming parliamentary events were found matching your filters for this period.</p>'
        return _base_template("Lookahead Alert: No Events", body, alert_name)

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
                link = f' &middot; <a href="{ev["source_url"]}">Details</a>'

            house = ev.get("house", "")
            location = ev.get("location", "")
            loc_str = f" &middot; {location}" if location else ""

            sections.append(f"""
            <div class="event-row">
              <span class="event-type event-type-{etype}">{etype.replace("_", " ").title()}</span>
              <strong>{ev.get("title", "")}</strong>
              <div style="font-size:12px;color:#666;margin-top:2px;">
                {time_str}{house}{loc_str}{link}
              </div>
            </div>""")

    body = summary_box + "\n".join(sections)
    return _base_template(f"Lookahead Alert: {len(events)} Events", body, alert_name)
