import { useState, useMemo } from "react";

const ACCENT = "#6366f1";
const ACCENT_SOFT = "rgba(99,102,241,0.08)";
const ACCENT_BORDER = "rgba(99,102,241,0.2)";

const EVENT_TYPES = {
  "Oral Qs":       { color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  "Debate":        { color: "#f472b6", bg: "rgba(244,114,182,0.12)" },
  "Committee":     { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  "Bill Stage":    { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  "WH Debate":     { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  "Statement":     { color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  "Gen. Committee": { color: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
};

const HOUSES = ["Commons", "Lords"];
const TOPICS = ["Housing", "Education", "Health", "Energy", "Trade", "Climate", "Defence", "Transport", "Economy", "Justice"];

const MOCK_EVENTS = [
  { id: 1, title: "Education Oral Questions", type: "Oral Qs", house: "Commons", location: "Chamber", day: 0, startHour: 9.5, duration: 1, topic: "Education" },
  { id: 2, title: "Debate: Planning Reform Bill — Second Reading", type: "Debate", house: "Commons", location: "Chamber", day: 0, startHour: 14.5, duration: 2.5, topic: "Housing" },
  { id: 3, title: "Backbench: Rural Mental Health", type: "Debate", house: "Commons", location: "Chamber", day: 0, startHour: 18, duration: 1.5, topic: "Health" },
  { id: 4, title: "Treasury Select Committee", type: "Committee", house: "Commons", location: "Grimond Room", day: 1, startHour: 9.25, duration: 2, topic: "Economy" },
  { id: 5, title: "Westminster Hall: Rural Bus Services", type: "WH Debate", house: "Commons", location: "Westminster Hall", day: 1, startHour: 11.5, duration: 1.5, topic: "Transport" },
  { id: 6, title: "Energy Bill — Committee Stage", type: "Bill Stage", house: "Lords", location: "Chamber", day: 1, startHour: 14, duration: 3, topic: "Energy" },
  { id: 7, title: "Health Oral Questions", type: "Oral Qs", house: "Commons", location: "Chamber", day: 1, startHour: 9.5, duration: 1, topic: "Health" },
  { id: 8, title: "Prime Minister's Questions", type: "Oral Qs", house: "Commons", location: "Chamber", day: 2, startHour: 12, duration: 0.5, topic: null },
  { id: 9, title: "Renters' Rights Bill — Report Stage", type: "Bill Stage", house: "Lords", location: "Chamber", day: 2, startHour: 14, duration: 2.5, topic: "Housing" },
  { id: 10, title: "Defence Oral Questions", type: "Oral Qs", house: "Commons", location: "Chamber", day: 2, startHour: 9.5, duration: 1, topic: "Defence" },
  { id: 11, title: "Ministerial Statement: NHS Winter Plan", type: "Statement", house: "Commons", location: "Chamber", day: 2, startHour: 11, duration: 0.75, topic: "Health" },
  { id: 12, title: "DCMS Select Committee: AI Regulation", type: "Committee", house: "Commons", location: "Boothroyd Room", day: 3, startHour: 9.5, duration: 2, topic: "Economy" },
  { id: 13, title: "Backbench Business: Veterans' Services", type: "Debate", house: "Commons", location: "Chamber", day: 3, startHour: 13.5, duration: 2, topic: "Defence" },
  { id: 14, title: "Trade (Comprehensive and Progressive) Bill", type: "Bill Stage", house: "Commons", location: "Chamber", day: 3, startHour: 16, duration: 2, topic: "Trade" },
  { id: 15, title: "Climate Change Committee Evidence Session", type: "Committee", house: "Commons", location: "Wilson Room", day: 3, startHour: 10, duration: 1.5, topic: "Climate" },
  { id: 16, title: "Education Bill — Gen. Committee", type: "Gen. Committee", house: "Commons", location: "Committee Room 10", day: 4, startHour: 9.5, duration: 2.5, topic: "Education" },
  { id: 17, title: "Debate: Sentencing Reform", type: "Debate", house: "Lords", location: "Chamber", day: 4, startHour: 13, duration: 2, topic: "Justice" },
  { id: 18, title: "Transport Oral Questions", type: "Oral Qs", house: "Commons", location: "Chamber", day: 4, startHour: 9.5, duration: 1, topic: "Transport" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DATES = ["24 Feb", "25 Feb", "26 Feb", "27 Feb", "28 Feb"];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

function formatTime(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function Badge({ children, color, bg }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 6px",
      borderRadius: 3, whiteSpace: "nowrap",
      background: bg || "rgba(255,255,255,0.06)",
      color: color || "#a1a1aa",
      letterSpacing: "0.02em",
    }}>
      {children}
    </span>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", fontSize: 12, fontWeight: 500,
      borderRadius: 5, border: "1px solid",
      borderColor: active ? ACCENT_BORDER : "rgba(255,255,255,0.08)",
      background: active ? ACCENT_SOFT : "transparent",
      color: active ? ACCENT : "#71717a",
      cursor: "pointer", transition: "all 0.15s ease",
      fontFamily: "inherit",
    }}>
      {label}
    </button>
  );
}

function TypeChip({ label, active, onClick, color, bg }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", fontSize: 12, fontWeight: 500,
      borderRadius: 5, border: "1px solid",
      borderColor: active ? `${color}33` : "rgba(255,255,255,0.08)",
      background: active ? bg : "transparent",
      color: active ? color : "#71717a",
      cursor: "pointer", transition: "all 0.15s ease",
      fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: active ? color : "#52525b",
        transition: "background 0.15s",
      }} />
      {label}
    </button>
  );
}

/* ─── Hover tooltip for grid events ─── */
function EventTooltip({ event }) {
  const et = EVENT_TYPES[event.type] || {};
  return (
    <div style={{
      position: "absolute", bottom: "calc(100% + 6px)", left: 0,
      background: "#1c1c20", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "10px 14px", minWidth: 220,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 100,
      pointerEvents: "none",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7", marginBottom: 6 }}>{event.title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <Badge color={et.color} bg={et.bg}>{event.type}</Badge>
        <Badge color={event.house === "Lords" ? "#fbbf24" : "#a1a1aa"} bg={event.house === "Lords" ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.06)"}>{event.house}</Badge>
        {event.topic && <Badge color={ACCENT} bg={ACCENT_SOFT}>{event.topic}</Badge>}
      </div>
      <div style={{ fontSize: 11, color: "#71717a" }}>
        {formatTime(event.startHour)} – {formatTime(event.startHour + event.duration)} · {event.location}
      </div>
    </div>
  );
}

/* ─── Weekly grid view ─── */
function WeekGrid({ events }) {
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const hourHeight = 56;
  const startHour = 9;

  return (
    <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
      <div style={{ display: "flex", minHeight: (HOURS.length) * hourHeight + 40 }}>
        {/* Time gutter */}
        <div style={{ width: 52, flexShrink: 0, paddingTop: 40, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
          {HOURS.map(h => (
            <div key={h} style={{
              height: hourHeight, display: "flex", alignItems: "flex-start",
              justifyContent: "flex-end", paddingRight: 10,
              fontSize: 10, color: "#3f3f46", fontVariantNumeric: "tabular-nums",
              transform: "translateY(-6px)",
            }}>
              {`${h.toString().padStart(2, "0")}:00`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((day, dayIndex) => {
          const dayEvents = events.filter(e => e.day === dayIndex);
          const isToday = dayIndex === 2;
          return (
            <div key={day} style={{
              flex: 1, borderRight: "1px solid rgba(255,255,255,0.04)",
              position: "relative", minWidth: 140,
            }}>
              {/* Day header */}
              <div style={{
                height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, borderBottom: "1px solid rgba(255,255,255,0.06)",
                position: "sticky", top: 0, background: "#0c0c0e", zIndex: 10,
              }}>
                <span style={{ fontSize: 11, color: isToday ? ACCENT : "#52525b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{day}</span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: isToday ? "#fff" : "#71717a",
                  ...(isToday ? {
                    background: ACCENT, borderRadius: 10, padding: "1px 7px",
                  } : {}),
                }}>{DATES[dayIndex].split(" ")[0]}</span>
              </div>

              {/* Hour grid lines */}
              <div style={{ position: "relative" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: hourHeight,
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                  }} />
                ))}

                {/* Events — laid out in columns when overlapping */}
                {(() => {
                  // Sort by start time, then duration (longer first)
                  const sorted = [...dayEvents].sort((a, b) => a.startHour - b.startHour || b.duration - a.duration);
                  
                  // Assign columns: for each event, find the first column where it doesn't overlap
                  const columns = [];
                  const eventLayout = sorted.map(event => {
                    const end = event.startHour + event.duration;
                    let col = 0;
                    while (columns[col] && columns[col] > event.startHour) {
                      col++;
                    }
                    columns[col] = end;
                    return { event, col };
                  });

                  // Find the max number of concurrent columns per event group
                  const totalCols = columns.length || 1;

                  return eventLayout.map(({ event, col }) => {
                    const et = EVENT_TYPES[event.type] || { color: "#a1a1aa", bg: "rgba(255,255,255,0.06)" };
                    const top = (event.startHour - startHour) * hourHeight;
                    const height = Math.max(event.duration * hourHeight - 2, 24);
                    const isHovered = hoveredEvent === event.id;

                    const colWidth = (100 / totalCols);
                    const leftPct = col * colWidth;
                    const widthPct = colWidth;

                    return (
                      <div
                        key={event.id}
                        onMouseEnter={() => setHoveredEvent(event.id)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        style={{
                          position: "absolute",
                          top,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          height,
                          background: isHovered ? et.bg.replace("0.12", "0.2") : et.bg,
                          borderLeft: `3px solid ${et.color}`,
                          borderRadius: 4,
                          padding: "4px 6px",
                          overflow: "hidden",
                          cursor: "pointer",
                          transition: "background 0.1s, box-shadow 0.1s",
                          boxShadow: isHovered ? `0 2px 8px ${et.color}22` : "none",
                          zIndex: isHovered ? 20 : 1,
                        }}
                      >
                        {isHovered && <EventTooltip event={event} />}
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: et.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          lineHeight: 1.3,
                        }}>
                          {event.title}
                        </div>
                        {height > 36 && (
                          <div style={{ fontSize: 10, color: `${et.color}99`, marginTop: 2 }}>
                            {formatTime(event.startHour)} · {event.location}
                          </div>
                        )}
                        {height > 56 && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            <span style={{
                              fontSize: 9, padding: "1px 4px", borderRadius: 2,
                              background: `${et.color}15`, color: `${et.color}cc`,
                            }}>{event.house}</span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── List view ─── */
function ListView({ events }) {
  const [hoveredRow, setHoveredRow] = useState(null);
  const grouped = {};
  events.forEach(e => {
    const dayKey = `${FULL_DAYS[e.day]} ${DATES[e.day]}`;
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(e);
  });

  Object.values(grouped).forEach(arr => arr.sort((a, b) => a.startHour - b.startHour));

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "4px 20px 20px" }}>
      {Object.entries(grouped).map(([dayLabel, dayEvents]) => (
        <div key={dayLabel} style={{ marginBottom: 6 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: "#52525b",
            textTransform: "uppercase", letterSpacing: "0.06em",
            padding: "12px 0 4px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            marginBottom: 2,
          }}>
            {dayLabel}
          </div>
          {dayEvents.map(event => {
            const et = EVENT_TYPES[event.type] || {};
            return (
              <div
                key={event.id}
                onMouseEnter={() => setHoveredRow(event.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "9px 12px", borderRadius: 6,
                  background: hoveredRow === event.id ? "rgba(255,255,255,0.03)" : "transparent",
                  transition: "background 0.1s", cursor: "pointer",
                }}
              >
                {/* Time */}
                <span style={{
                  fontSize: 12, color: "#52525b", width: 46, flexShrink: 0,
                  fontVariantNumeric: "tabular-nums", fontWeight: 500,
                }}>{formatTime(event.startHour)}</span>

                {/* Color bar */}
                <div style={{
                  width: 3, height: 28, borderRadius: 2,
                  background: et.color || "#52525b", flexShrink: 0,
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: "#e4e4e7", fontWeight: 500,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{event.title}</div>
                  <div style={{ fontSize: 11, color: "#3f3f46", marginTop: 1 }}>
                    {formatTime(event.startHour)} – {formatTime(event.startHour + event.duration)} · {event.location}
                  </div>
                </div>

                {/* Tags */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <Badge color={et.color} bg={et.bg}>{event.type}</Badge>
                  <Badge
                    color={event.house === "Lords" ? "#fbbf24" : "#a1a1aa"}
                    bg={event.house === "Lords" ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.06)"}
                  >{event.house}</Badge>
                  {event.topic && <Badge color={ACCENT} bg={ACCENT_SOFT}>{event.topic}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── Filter panel (collapsible) ─── */
function FilterPanel({ show, activeTypes, toggleType, activeHouses, toggleHouse, activeTopics, toggleTopic, eventCount, totalCount }) {
  if (!show) return null;
  return (
    <div style={{
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "14px 20px",
      display: "flex", gap: 24, alignItems: "flex-start",
      animation: "ps-slideDown 0.15s ease",
    }}>
      {/* Event types */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Event Type</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Object.entries(EVENT_TYPES).map(([type, { color, bg }]) => (
            <TypeChip key={type} label={type} active={activeTypes.includes(type)} onClick={() => toggleType(type)} color={color} bg={bg} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 48, background: "rgba(255,255,255,0.06)", flexShrink: 0, alignSelf: "center" }} />

      {/* House */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>House</span>
        <div style={{ display: "flex", gap: 4 }}>
          {HOUSES.map(h => (
            <FilterChip key={h} label={h} active={activeHouses.includes(h)} onClick={() => toggleHouse(h)} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 48, background: "rgba(255,255,255,0.06)", flexShrink: 0, alignSelf: "center" }} />

      {/* Topics */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Topics</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TOPICS.map(t => (
            <FilterChip key={t} label={t} active={activeTopics.includes(t)} onClick={() => toggleTopic(t)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
export default function ParliScanCalendar() {
  const [view, setView] = useState("week");
  const [showFilters, setShowFilters] = useState(false);
  const [activeTypes, setActiveTypes] = useState(Object.keys(EVENT_TYPES));
  const [activeHouses, setActiveHouses] = useState([...HOUSES]);
  const [activeTopics, setActiveTopics] = useState([]);

  const toggleType = (t) => setActiveTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleHouse = (h) => setActiveHouses(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
  const toggleTopic = (t) => setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const filtered = useMemo(() => {
    return MOCK_EVENTS.filter(e => {
      if (!activeTypes.includes(e.type)) return false;
      if (!activeHouses.includes(e.house)) return false;
      if (activeTopics.length > 0 && e.topic && !activeTopics.includes(e.topic)) return false;
      return true;
    });
  }, [activeTypes, activeHouses, activeTopics]);

  const activeFilterCount = (Object.keys(EVENT_TYPES).length - activeTypes.length) + (HOUSES.length - activeHouses.length) + activeTopics.length;

  const clearFilters = () => {
    setActiveTypes(Object.keys(EVENT_TYPES));
    setActiveHouses([...HOUSES]);
    setActiveTopics([]);
  };

  return (
    <div style={{
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      background: "#09090b", color: "#a1a1aa",
      height: "100vh", display: "flex", flexDirection: "column",
      fontSize: 13, lineHeight: 1.5,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        {/* Title & week navigation */}
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "#e4e4e7", margin: 0, letterSpacing: "-0.02em" }}>Calendar</h1>

        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />

        {/* Week nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={{ padding: "3px 8px", fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#a1a1aa", cursor: "pointer", fontFamily: "inherit" }}>←</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", minWidth: 160, textAlign: "center" }}>24 – 28 Feb 2025</span>
          <button style={{ padding: "3px 8px", fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#a1a1aa", cursor: "pointer", fontFamily: "inherit" }}>→</button>
        </div>

        <button style={{
          padding: "3px 10px", fontSize: 12, fontWeight: 500,
          background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}`,
          borderRadius: 4, color: ACCENT, cursor: "pointer", fontFamily: "inherit",
        }}>Today</button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* View toggle */}
        <div style={{
          display: "flex", borderRadius: 6, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {[
            { key: "week", label: "Week" },
            { key: "list", label: "List" },
          ].map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500,
              background: view === v.key ? "rgba(255,255,255,0.08)" : "transparent",
              color: view === v.key ? "#e4e4e7" : "#52525b",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.1s",
            }}>{v.label}</button>
          ))}
        </div>

        {/* Filter toggle */}
        <button onClick={() => setShowFilters(!showFilters)} style={{
          padding: "5px 12px", fontSize: 12, fontWeight: 500,
          borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
          background: showFilters ? ACCENT_SOFT : "transparent",
          border: `1px solid ${showFilters ? ACCENT_BORDER : "rgba(255,255,255,0.08)"}`,
          color: showFilters ? ACCENT : "#71717a",
          transition: "all 0.15s",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#fff",
              background: ACCENT, borderRadius: 10, padding: "0 5px",
              minWidth: 16, textAlign: "center", lineHeight: "16px",
            }}>{activeFilterCount}</span>
          )}
        </button>

        {/* Refresh */}
        <button style={{
          padding: "5px 8px", fontSize: 14, background: "transparent",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
          color: "#52525b", cursor: "pointer", fontFamily: "inherit",
        }}>↻</button>
      </header>

      {/* Filters */}
      <FilterPanel
        show={showFilters}
        activeTypes={activeTypes} toggleType={toggleType}
        activeHouses={activeHouses} toggleHouse={toggleHouse}
        activeTopics={activeTopics} toggleTopic={toggleTopic}
        eventCount={filtered.length} totalCount={MOCK_EVENTS.length}
      />

      {/* Info bar */}
      <div style={{
        padding: "6px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, color: "#3f3f46",
      }}>
        <span style={{ color: "#71717a" }}>{filtered.length} events</span>
        {activeFilterCount > 0 && (
          <>
            <span>·</span>
            <span>{activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</span>
            <button onClick={clearFilters} style={{
              padding: "1px 6px", fontSize: 11, fontWeight: 500,
              background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 3, color: "#71717a", cursor: "pointer", fontFamily: "inherit",
            }}>Clear all</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {/* Type legend (mini) */}
        <div style={{ display: "flex", gap: 10 }}>
          {Object.entries(EVENT_TYPES).slice(0, 5).map(([type, { color }]) => (
            <span key={type} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#3f3f46" }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: color }} />
              {type}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === "week" ? <WeekGrid events={filtered} /> : <ListView events={filtered} />}

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
        button:hover { opacity: 0.9; }
        @keyframes ps-slideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
