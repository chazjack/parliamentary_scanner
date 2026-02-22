import { useState } from "react";

const ACCENT = "#6366f1";
const ACCENT_SOFT = "rgba(99,102,241,0.08)";
const ACCENT_BORDER = "rgba(99,102,241,0.2)";

const PARTIES = {
  Labour: "#dc2626",
  Conservative: "#1d4ed8",
  "Lib Dem": "#f59e0b",
  SNP: "#fbbf24",
  Green: "#16a34a",
  Independent: "#6b7280",
  Plaid: "#22c55e",
  DUP: "#7c3aed",
};

const MOCK_RESULTS = [
  { id: 1, name: "Keir Starmer", party: "Labour", topic: "Housing", summary: "Raised concerns about social housing supply in debate on planning reform", forum: "Commons Chamber", type: "Debate" },
  { id: 2, name: "Kemi Badenoch", party: "Conservative", topic: "Trade", summary: "Written question on post-Brexit trade agreement timelines with India", forum: "Written Questions", type: "WQ" },
  { id: 3, name: "Ed Davey", party: "Lib Dem", topic: "Environment", summary: "Tabled EDM calling for stronger sewage discharge penalties", forum: "EDMs", type: "EDM" },
  { id: 4, name: "Stephen Flynn", party: "SNP", topic: "Energy", summary: "Intervened on energy price cap debate citing Scottish renewables capacity", forum: "Commons Chamber", type: "Debate" },
  { id: 5, name: "Caroline Lucas", party: "Green", topic: "Climate", summary: "Written statement on net zero progress and 2030 interim targets", forum: "Written Statements", type: "WS" },
  { id: 6, name: "Hilary Benn", party: "Labour", topic: "Housing", summary: "Responded to urgent question on building safety remediation funding", forum: "Commons Chamber", type: "Debate" },
  { id: 7, name: "Jeremy Hunt", party: "Conservative", topic: "Economy", summary: "Division vote on fiscal framework amendments — voted against", forum: "Divisions", type: "Division" },
  { id: 8, name: "Layla Moran", party: "Lib Dem", topic: "Education", summary: "Oral question on SEND funding allocations for 2025-26", forum: "Oral Questions", type: "OQ" },
];

const MOCK_CALENDAR = [
  { date: "Mon 24 Feb", time: "09:30", event: "Education Oral Questions", type: "Oral Qs", house: "Commons", location: "Chamber" },
  { date: "Mon 24 Feb", time: "14:30", event: "Debate: Planning Reform Bill — Second Reading", type: "Debate", house: "Commons", location: "Chamber" },
  { date: "Tue 25 Feb", time: "09:15", event: "Treasury Select Committee", type: "Committee", house: "Commons", location: "Grimond Room" },
  { date: "Tue 25 Feb", time: "11:30", event: "Westminster Hall: Rural Bus Services", type: "WH Debate", house: "Commons", location: "Westminster Hall" },
  { date: "Wed 26 Feb", time: "12:00", event: "Prime Minister's Questions", type: "Oral Qs", house: "Commons", location: "Chamber" },
  { date: "Wed 26 Feb", time: "14:00", event: "Renters' Rights Bill — Committee Stage", type: "Bill Stage", house: "Lords", location: "Chamber" },
  { date: "Thu 27 Feb", time: "09:30", event: "DCMS Select Committee: AI Regulation", type: "Committee", house: "Commons", location: "Boothroyd Room" },
  { date: "Thu 27 Feb", time: "13:30", event: "Backbench Business: Veterans' Services", type: "Debate", house: "Commons", location: "Chamber" },
];

const MOCK_STAKEHOLDERS = [
  { name: "Hilary Benn", party: "Labour", type: "MP", constituency: "Leeds South", topics: ["Housing", "Planning"], priority: "High", activities: 12 },
  { name: "Kemi Badenoch", party: "Conservative", type: "MP", constituency: "North West Essex", topics: ["Trade", "Business"], priority: "High", activities: 8 },
  { name: "Ed Davey", party: "Lib Dem", type: "MP", constituency: "Kingston and Surbiton", topics: ["Environment", "Water"], priority: "Medium", activities: 6 },
  { name: "Caroline Lucas", party: "Green", type: "Peer", constituency: "—", topics: ["Climate", "Energy"], priority: "Medium", activities: 4 },
];

const MOCK_ALERTS = [
  { name: "Weekly Housing Scan", type: "Scan", schedule: "Weekly · Mon 08:00", recipients: 3, lastRun: "17 Feb 2025", status: "active" },
  { name: "Daily Calendar Digest", type: "Calendar", schedule: "Daily · 07:00", recipients: 1, lastRun: "21 Feb 2025", status: "active" },
  { name: "Energy Policy Watch", type: "Scan", schedule: "Weekly · Fri 16:00", recipients: 2, lastRun: "14 Feb 2025", status: "paused" },
];

const SOURCES = ["Hansard", "Written Qs", "Written Statements", "EDMs", "Bills", "Divisions"];
const TOPICS = ["Housing", "Trade", "Environment", "Energy", "Climate", "Economy", "Education", "Health", "Transport", "Defence"];

function PartyDot({ party }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: "50%",
      backgroundColor: PARTIES[party] || "#6b7280",
      display: "inline-block", flexShrink: 0,
    }} />
  );
}

function Badge({ children, variant = "default" }) {
  const styles = {
    default: { background: "rgba(255,255,255,0.06)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" },
    accent: { background: ACCENT_SOFT, color: ACCENT, border: `1px solid ${ACCENT_BORDER}` },
    success: { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" },
    warning: { background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" },
    muted: { background: "transparent", color: "#71717a", border: "1px solid rgba(255,255,255,0.06)" },
  };
  return (
    <span style={{
      ...styles[variant],
      fontSize: 11, fontWeight: 500, padding: "2px 8px",
      borderRadius: 4, letterSpacing: "0.02em", whiteSpace: "nowrap",
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
      color: active ? ACCENT : "#a1a1aa",
      cursor: "pointer", transition: "all 0.15s ease",
      fontFamily: "inherit",
    }}>
      {label}
    </button>
  );
}

function StatusDot({ status }) {
  const color = status === "active" ? "#4ade80" : "#fbbf24";
  return <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, display: "inline-block" }} />;
}

function ScannerView({ activeSources, setActiveSources, activeTopics, setActiveTopics }) {
  const [hoveredRow, setHoveredRow] = useState(null);

  const toggleSource = (s) => setActiveSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleTopic = (t) => setActiveTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const filtered = MOCK_RESULTS.filter(r =>
    (activeTopics.length === 0 || activeTopics.includes(r.topic))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      {/* Filters bar */}
      <div style={{
        padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", gap: 20, alignItems: "flex-start",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sources</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SOURCES.map(s => (
              <FilterChip key={s} label={s} active={activeSources.includes(s)} onClick={() => toggleSource(s)} />
            ))}
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.06)", flexShrink: 0, alignSelf: "center" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Topics</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TOPICS.map(t => (
              <FilterChip key={t} label={t} active={activeTopics.includes(t)} onClick={() => toggleTopic(t)} />
            ))}
          </div>
        </div>
        <div style={{ marginLeft: "auto", alignSelf: "center" }}>
          <button style={{
            padding: "7px 16px", fontSize: 13, fontWeight: 600,
            borderRadius: 6, border: "none",
            background: ACCENT, color: "#fff",
            cursor: "pointer", fontFamily: "inherit",
            transition: "opacity 0.15s",
          }}>
            Run Scan
          </button>
        </div>
      </div>

      {/* Results count */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>{filtered.length} results</span>
        <span style={{ fontSize: 12, color: "#3f3f46" }}>·</span>
        <span style={{ fontSize: 12, color: "#3f3f46" }}>Last scan: 21 Feb 2025, 14:32</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Member", "Topic", "Summary", "Source", "Type"].map(h => (
                <th key={h} style={{
                  padding: "8px 20px", textAlign: "left", fontSize: 11,
                  fontWeight: 600, color: "#52525b", textTransform: "uppercase",
                  letterSpacing: "0.06em", position: "sticky", top: 0,
                  background: "#0c0c0e",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                onMouseEnter={() => setHoveredRow(r.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: hoveredRow === r.id ? "rgba(255,255,255,0.02)" : "transparent",
                  transition: "background 0.1s",
                  cursor: "pointer",
                }}
              >
                <td style={{ padding: "10px 20px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PartyDot party={r.party} />
                    <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{r.name}</span>
                    <span style={{ color: "#52525b", fontSize: 12 }}>{r.party}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 20px" }}>
                  <Badge variant="accent">{r.topic}</Badge>
                </td>
                <td style={{ padding: "10px 20px", color: "#a1a1aa", maxWidth: 400 }}>
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {r.summary}
                  </span>
                </td>
                <td style={{ padding: "10px 20px", color: "#71717a", whiteSpace: "nowrap" }}>{r.forum}</td>
                <td style={{ padding: "10px 20px" }}>
                  <Badge>{r.type}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalendarView() {
  const [hoveredRow, setHoveredRow] = useState(null);
  const grouped = {};
  MOCK_CALENDAR.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7" }}>Week of 24 Feb 2025</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button style={{ padding: "3px 8px", fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#a1a1aa", cursor: "pointer", fontFamily: "inherit" }}>←</button>
          <button style={{ padding: "3px 8px", fontSize: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, color: "#a1a1aa", cursor: "pointer", fontFamily: "inherit" }}>→</button>
        </div>
        <button style={{ padding: "3px 10px", fontSize: 12, background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 4, color: ACCENT, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, marginLeft: 4 }}>Today</button>
      </div>

      {Object.entries(grouped).map(([date, events]) => (
        <div key={date} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 0 4px" }}>
            {date}
          </div>
          {events.map((e, i) => {
            const key = `${date}-${i}`;
            return (
              <div
                key={key}
                onMouseEnter={() => setHoveredRow(key)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "8px 12px", borderRadius: 6,
                  background: hoveredRow === key ? "rgba(255,255,255,0.03)" : "transparent",
                  transition: "background 0.1s", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 12, color: "#52525b", width: 42, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{e.time}</span>
                <span style={{ fontSize: 13, color: "#e4e4e7", fontWeight: 500, flex: 1 }}>{e.event}</span>
                <Badge>{e.type}</Badge>
                <Badge variant={e.house === "Lords" ? "warning" : "muted"}>{e.house}</Badge>
                <span style={{ fontSize: 12, color: "#3f3f46", width: 120, textAlign: "right" }}>{e.location}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StakeholdersView() {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>{MOCK_STAKEHOLDERS.length} stakeholders</span>
        <div style={{ marginLeft: "auto" }}>
          <button style={{
            padding: "5px 12px", fontSize: 12, fontWeight: 500,
            borderRadius: 5, border: `1px solid ${ACCENT_BORDER}`,
            background: ACCENT_SOFT, color: ACCENT,
            cursor: "pointer", fontFamily: "inherit",
          }}>+ Add</button>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["Member", "Type", "Constituency", "Topics", "Priority", "Activity"].map(h => (
              <th key={h} style={{
                padding: "8px 20px", textAlign: "left", fontSize: 11,
                fontWeight: 600, color: "#52525b", textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_STAKEHOLDERS.map((s, i) => (
            <tr
              key={i}
              onMouseEnter={() => setHoveredRow(i)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: hoveredRow === i ? "rgba(255,255,255,0.02)" : "transparent",
                transition: "background 0.1s", cursor: "pointer",
              }}
            >
              <td style={{ padding: "10px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <PartyDot party={s.party} />
                  <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{s.name}</span>
                  <span style={{ color: "#52525b", fontSize: 12 }}>{s.party}</span>
                </div>
              </td>
              <td style={{ padding: "10px 20px" }}><Badge>{s.type}</Badge></td>
              <td style={{ padding: "10px 20px", color: "#71717a" }}>{s.constituency}</td>
              <td style={{ padding: "10px 20px" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {s.topics.map(t => <Badge key={t} variant="accent">{t}</Badge>)}
                </div>
              </td>
              <td style={{ padding: "10px 20px" }}>
                <Badge variant={s.priority === "High" ? "accent" : "muted"}>{s.priority}</Badge>
              </td>
              <td style={{ padding: "10px 20px", color: "#71717a", fontVariantNumeric: "tabular-nums" }}>{s.activities}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsView() {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: "#71717a" }}>{MOCK_ALERTS.length} alerts configured</span>
        <div style={{ marginLeft: "auto" }}>
          <button style={{
            padding: "5px 12px", fontSize: 12, fontWeight: 500,
            borderRadius: 5, border: `1px solid ${ACCENT_BORDER}`,
            background: ACCENT_SOFT, color: ACCENT,
            cursor: "pointer", fontFamily: "inherit",
          }}>+ New Alert</button>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["Status", "Name", "Type", "Schedule", "Recipients", "Last Run"].map(h => (
              <th key={h} style={{
                padding: "8px 20px", textAlign: "left", fontSize: 11,
                fontWeight: 600, color: "#52525b", textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_ALERTS.map((a, i) => (
            <tr
              key={i}
              onMouseEnter={() => setHoveredRow(i)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: hoveredRow === i ? "rgba(255,255,255,0.02)" : "transparent",
                transition: "background 0.1s", cursor: "pointer",
              }}
            >
              <td style={{ padding: "10px 20px" }}><StatusDot status={a.status} /></td>
              <td style={{ padding: "10px 20px", color: "#e4e4e7", fontWeight: 500 }}>{a.name}</td>
              <td style={{ padding: "10px 20px" }}><Badge variant={a.type === "Scan" ? "accent" : "muted"}>{a.type}</Badge></td>
              <td style={{ padding: "10px 20px", color: "#71717a" }}>{a.schedule}</td>
              <td style={{ padding: "10px 20px", color: "#71717a", fontVariantNumeric: "tabular-nums" }}>{a.recipients}</td>
              <td style={{ padding: "10px 20px", color: "#3f3f46" }}>{a.lastRun}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NAV_ITEMS = [
  { key: "scanner", label: "Scanner", icon: "⊘" },
  { key: "calendar", label: "Calendar", icon: "▦" },
  { key: "stakeholders", label: "Stakeholders", icon: "◉" },
  { key: "alerts", label: "Alerts", icon: "◈" },
];

export default function ParliScanRedesign() {
  const [activeTab, setActiveTab] = useState("scanner");
  const [activeSources, setActiveSources] = useState(["Hansard", "Written Qs", "EDMs"]);
  const [activeTopics, setActiveTopics] = useState([]);

  return (
    <div style={{
      fontFamily: "'DM Sans', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      background: "#09090b", color: "#a1a1aa", minHeight: "100vh",
      display: "flex", fontSize: 13, lineHeight: 1.5,
    }}>
      {/* Load font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside style={{
        width: 220, borderRight: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexDirection: "column", padding: "16px 0",
        flexShrink: 0, background: "#09090b",
      }}>
        {/* Logo */}
        <div style={{ padding: "0 16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: `linear-gradient(135deg, ${ACCENT}, #818cf8)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>P</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7", letterSpacing: "-0.02em" }}>ParliScan</div>
            <div style={{ fontSize: 10, color: "#3f3f46", fontWeight: 500 }}>Parliamentary Monitor</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px" }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 6,
                background: activeTab === item.key ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none", cursor: "pointer",
                color: activeTab === item.key ? "#e4e4e7" : "#52525b",
                fontSize: 13, fontWeight: activeTab === item.key ? 600 : 500,
                fontFamily: "inherit", textAlign: "left",
                transition: "all 0.1s ease",
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.7, width: 18, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={{ marginTop: "auto", padding: "0 8px" }}>
          <div style={{
            padding: "12px", borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#52525b", marginBottom: 6 }}>QUICK SCAN</div>
            <input
              type="text"
              placeholder="Search Hansard..."
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 5, color: "#e4e4e7", outline: "none",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{
            marginTop: 12, padding: "8px 10px",
            fontSize: 11, color: "#3f3f46",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
            API Connected
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <header style={{
          padding: "12px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <h1 style={{
            fontSize: 16, fontWeight: 700, color: "#e4e4e7",
            margin: 0, letterSpacing: "-0.02em",
          }}>
            {NAV_ITEMS.find(n => n.key === activeTab)?.label}
          </h1>
          {activeTab === "scanner" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#3f3f46", padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)" }}>
                ⌘K to search
              </span>
            </div>
          )}
        </header>

        {/* Content area */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeTab === "scanner" && (
            <ScannerView
              activeSources={activeSources} setActiveSources={setActiveSources}
              activeTopics={activeTopics} setActiveTopics={setActiveTopics}
            />
          )}
          {activeTab === "calendar" && <CalendarView />}
          {activeTab === "stakeholders" && <StakeholdersView />}
          {activeTab === "alerts" && <AlertsView />}
        </div>
      </main>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
        button:hover { opacity: 0.85; }
        input::placeholder { color: #3f3f46; }
        input:focus { border-color: ${ACCENT_BORDER} !important; }
      `}</style>
    </div>
  );
}
