/* ============================================================
   ParliScan — Scanner Walkthrough Tour
   Real data from scan #196 (04/03/2026 11:18)
   ============================================================ */

(function () {
  'use strict';

  // ── Mock content ─────────────────────────────────────────────────────────────

  const M = {

    // Scan #196: 23 Feb – 4 Mar 2026
    date: `23\u202fFeb\u202f\u2013\u202f4\u202fMar\u202f2026`,

    // Six members filtered in this scan
    memberPills: `
      <span class="member-selected-pill" data-id="tour-mock-1">
        <span class="member-selected-pill__name">Liz Kendall</span>
        <button class="member-selected-pill__clear" disabled style="opacity:0.4;">&#x2715;</button>
      </span>
      <span class="member-selected-pill" data-id="tour-mock-2">
        <span class="member-selected-pill__name">Kanishka Narayan</span>
        <button class="member-selected-pill__clear" disabled style="opacity:0.4;">&#x2715;</button>
      </span>
      <span class="member-selected-pill" data-id="tour-mock-3">
        <span class="member-selected-pill__name">Lord Leong</span>
        <button class="member-selected-pill__clear" disabled style="opacity:0.4;">&#x2715;</button>
      </span>
      <span class="member-selected-pill" data-id="tour-mock-4">
        <span class="member-selected-pill__name">Baroness Kidron</span>
        <button class="member-selected-pill__clear" disabled style="opacity:0.4;">&#x2715;</button>
      </span>
      <span class="member-selected-pill" data-id="tour-mock-5">
        <span class="member-selected-pill__name">Baroness Chakrabarti</span>
        <button class="member-selected-pill__clear" disabled style="opacity:0.4;">&#x2715;</button>
      </span>
      <span class="member-selected-pill" data-id="tour-mock-6">
        <span class="member-selected-pill__name">Dame Chi Onwurah</span>
        <button class="member-selected-pill__clear" disabled style="opacity:0.4;">&#x2715;</button>
      </span>`,

    // All 15 topics — 3 active (IDs 24, 1, 38), rest unselected
    topicChips: `
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--active">
        <button class="ps-chip ps-chip--active" data-topic-id="24" title="19 keywords">AI Companies</button>
        <button class="ps-chip-edit" data-topic-id="24" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="11" title="9 keywords">AI Sovereignty</button>
        <button class="ps-chip-edit" data-topic-id="11" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="15" title="4 keywords">AI and climate</button>
        <button class="ps-chip-edit" data-topic-id="15" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="25" title="4 keywords">AI and defence</button>
        <button class="ps-chip-edit" data-topic-id="25" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="26" title="7 keywords">AI leaders</button>
        <button class="ps-chip-edit" data-topic-id="26" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--active">
        <button class="ps-chip ps-chip--active" data-topic-id="1" title="9 keywords">AI regulation</button>
        <button class="ps-chip-edit" data-topic-id="1" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="2" title="13 keywords">AI security</button>
        <button class="ps-chip-edit" data-topic-id="2" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--active">
        <button class="ps-chip ps-chip--active" data-topic-id="38" title="8 keywords">Biometrics</button>
        <button class="ps-chip-edit" data-topic-id="38" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="9" title="5 keywords">Copyright</button>
        <button class="ps-chip-edit" data-topic-id="9" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="7" title="8 keywords">Future of work</button>
        <button class="ps-chip-edit" data-topic-id="7" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="4" title="7 keywords">Mis/disinformation</button>
        <button class="ps-chip-edit" data-topic-id="4" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="3" title="17 keywords">Online harms</button>
        <button class="ps-chip-edit" data-topic-id="3" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="32" title="17 keywords">Online safety</button>
        <button class="ps-chip-edit" data-topic-id="32" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="33" title="3 keywords">Open source AI</button>
        <button class="ps-chip-edit" data-topic-id="33" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>
      <span class="ps-chip-topic-wrap">
        <button class="ps-chip" data-topic-id="12" title="8 keywords">Public services</button>
        <button class="ps-chip-edit" data-topic-id="12" title="Edit keywords" onclick="return false;"><span class="chip-arrow">&#8250;</span></button>
      </span>`,

    // Keyword breakdown — 36 keywords across 3 topics, real match counts
    keywords: `
      <div style="font-size:0.78rem;color:var(--ps-text-secondary);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);">
        <strong style="color:var(--ps-text-primary);">36</strong> keywords across 3 topics
      </div>
      <div class="kw-topic-group">
        <div class="kw-topic-header">
          AI Companies
          <span class="kw-topic-tick" aria-label="Complete">&#10003;</span>
        </div>
        <div class="kw-chip-list">
          <span class="kw-chip kw-done">X<span class="kw-count">40</span></span>
          <span class="kw-chip kw-done">Google<span class="kw-count">2</span></span>
          <span class="kw-chip kw-done">AWS<span class="kw-count">2</span></span>
          <span class="kw-chip kw-done">Meta<span class="kw-count">1</span></span>
          <span class="kw-chip kw-done">Microsoft<span class="kw-count">1</span></span>
          <span class="kw-chip kw-done">AI companies<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">AI labs<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Amazon<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Anthropic<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Apple<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">ChatGPT<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Claude<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Deepmind<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Deepseek<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Elevenlabs<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Gemini<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Grok<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Nvidia<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">OpenAI<span class="kw-count">0</span></span>
        </div>
      </div>
      <div class="kw-topic-group">
        <div class="kw-topic-header">
          AI regulation
          <span class="kw-topic-tick" aria-label="Complete">&#10003;</span>
        </div>
        <div class="kw-chip-list">
          <span class="kw-chip kw-done">Ofcom<span class="kw-count">5</span></span>
          <span class="kw-chip kw-done">ICO<span class="kw-count">3</span></span>
          <span class="kw-chip kw-done">CMA<span class="kw-count">1</span></span>
          <span class="kw-chip kw-done">AI act<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">AI bill<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">AI legislation<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">AI regulation<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">Crime and Policing<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">digital markets<span class="kw-count">0</span></span>
        </div>
      </div>
      <div class="kw-topic-group">
        <div class="kw-topic-header">
          Biometrics
          <span class="kw-topic-tick" aria-label="Complete">&#10003;</span>
        </div>
        <div class="kw-chip-list">
          <span class="kw-chip kw-done">biometric<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">biometric data<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">digital ID<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">emotion recognition<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">facial recognition<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">live facial recognition<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">LFR<span class="kw-count">0</span></span>
          <span class="kw-chip kw-done">surveillance<span class="kw-count">0</span></span>
        </div>
      </div>`,

    // Real pipeline stats from scan #196
    pipeline: `
      <div id="tour-pipe-1" class="pipe-box pipe-box-has-tooltip">
        <div class="pipe-box-value">72</div>
        <div class="pipe-box-label">Keyword Results</div>
      </div>
      <div id="tour-pipe-2" class="pipe-box">
        <div class="pipe-box-value">42/42</div>
        <div class="pipe-box-label">Classified</div>
      </div>
      <div id="tour-pipe-3" class="pipe-box pipe-box-relevant">
        <div class="pipe-box-value">12</div>
        <div class="pipe-box-label">Relevant</div>
      </div>
      <div id="tour-pipe-4" class="pipe-box pipe-box-discarded">
        <div class="pipe-box-value">30</div>
        <div class="pipe-box-label">Discarded</div>
      </div>`,

    // All 12 relevant results came from Hansard
    sources: `
      <div class="audit-count">
        <span class="count-badge source-badge--hansard">12</span>
        <span>Hansard</span>
      </div>`,

    // 5 representative mentions from the 12 real results
    mentions: `
      <tr>
        <td><div class="ps-member"><span class="ps-member__name">Dame Chi Onwurah</span></div></td>
        <td>
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <br><span class="ps-badge" style="background:rgba(87,81,120,0.15);color:#9b8fc9;border-color:#9b8fc955">MP</span>
        </td>
        <td>
          <span class="ps-badge ps-badge--accent">AI Companies</span>
          <span class="ps-badge ps-badge--accent">AI regulation</span>
        </td>
        <td>Onwurah advocates for AI use in Parliament but demands it be secure, ethical and in public interest, while questioning Microsoft&#8217;s influence over Copilot&#8217;s development.</td>
        <td>I believe that Parliament can&#8202;&#8212;&#8202;indeed must&#8202;&#8212;&#8202;use <strong>AI</strong> to improve our productivity, but it must be used securely, ethically, effectively and in the public interest.</td>
        <td>
          <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
          <br><span class="ps-forum-detail">Productivity: Technology</span>
          <small class="ps-forum-date"><strong>26/02/26</strong></small>
        </td>
        <td></td>
      </tr>
      <tr>
        <td><div class="ps-member"><span class="ps-member__name">Dame Chi Onwurah</span></div></td>
        <td>
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <br><span class="ps-badge" style="background:rgba(87,81,120,0.15);color:#9b8fc9;border-color:#9b8fc955">MP</span>
        </td>
        <td><span class="ps-badge ps-badge--accent">AI regulation</span></td>
        <td>Onwurah advocates for government regulation of online platforms to protect children from online harms, criticising Conservative inaction and the tech industry&#8217;s resistance to oversight.</td>
        <td>Tech platforms have their origins in a libertarian, small/no-government tech bro bubble that has spread globally&#8202;&#8212;&#8202;which is how we arrived in 2024 without online harms regulation.</td>
        <td>
          <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
          <br><span class="ps-forum-detail">Online Harm: Child Protection</span>
          <small class="ps-forum-date"><strong>24/02/26</strong></small>
        </td>
        <td></td>
      </tr>
      <tr>
        <td><div class="ps-member"><span class="ps-member__name">Baroness Kidron</span></div></td>
        <td>
          <span class="ps-badge" style="background:rgba(156,163,175,0.15);color:#9ca3af;border-color:#9ca3af55">Crossbench</span>
          <br><span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </td>
        <td><span class="ps-badge ps-badge--accent">AI regulation</span></td>
        <td>Kidron advocates for AI regulation that holds general-purpose technology companies liable for harms including child sexual abuse and intimate image abuse.</td>
        <td>There seems to be a reluctance to catch general-purpose technology in these issues of child abuse, violence against women and intimate image abuse&#8202;&#8212;&#8202;I believe it does not really matter whether it is accidental on the part of the company.</td>
        <td>
          <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
          <br><span class="ps-forum-detail">Crime and Policing Bill</span>
          <small class="ps-forum-date"><strong>02/03/26</strong></small>
        </td>
        <td></td>
      </tr>
      <tr>
        <td><div class="ps-member"><span class="ps-member__name">Baroness Kidron</span></div></td>
        <td>
          <span class="ps-badge" style="background:rgba(156,163,175,0.15);color:#9ca3af;border-color:#9ca3af55">Crossbench</span>
          <br><span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </td>
        <td><span class="ps-badge ps-badge--accent">AI regulation</span></td>
        <td>Kidron advocates for mandatory AI risk assessment, requiring mitigation within 14 days and extending obligations to companies outside the Online Safety Act.</td>
        <td>Amendment 209 seeks to do three things: to make risk assessment mandatory; to require mitigation within 14 days; and to hold companies not covered by the <strong>Online Safety Act</strong> to the same standard. Permission is not enough.</td>
        <td>
          <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
          <br><span class="ps-forum-detail">Crime and Policing Bill</span>
          <small class="ps-forum-date"><strong>02/03/26</strong></small>
        </td>
        <td></td>
      </tr>
      <tr>
        <td><div class="ps-member"><span class="ps-member__name">Lord Leong</span></div></td>
        <td>
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <br><span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </td>
        <td><span class="ps-badge ps-badge--accent">AI regulation</span></td>
        <td>Leong expresses support for embracing AI while emphasising the need to ensure safety, reflecting a pro-innovation but safety-conscious government position.</td>
        <td>We have to embrace <strong>AI</strong> in all our future considerations and ensure that it is safe for everybody.</td>
        <td>
          <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
          <br><span class="ps-forum-detail">AI: Labour Market Changes</span>
          <small class="ps-forum-date"><strong>25/02/26</strong></small>
        </td>
        <td></td>
      </tr>`,

    // Members leaderboard — all 3 members from real scan, all collapsed (pre-load state)
    membersCollapsed: `
      <tr class="index-standings-row">
        <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">1</td>
        <td><div class="ps-member"><span class="ps-member__name">Dame Chi Onwurah</span></div></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <span class="ps-badge" style="background:rgba(87,81,120,0.15);color:#9b8fc9;border-color:#9b8fc955">MP</span>
        </div></td>
        <td style="text-align:center;color:var(--ps-text-secondary);">5</td>
      </tr>
      <tr class="index-standings-row">
        <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">2</td>
        <td><div class="ps-member"><span class="ps-member__name">Baroness Kidron</span></div></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          <span class="ps-badge" style="background:rgba(156,163,175,0.15);color:#9ca3af;border-color:#9ca3af55">Crossbench</span>
          <span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </div></td>
        <td style="text-align:center;color:var(--ps-text-secondary);">4</td>
      </tr>
      <tr class="index-standings-row">
        <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">3</td>
        <td><div class="ps-member"><span class="ps-member__name">Lord Leong</span></div></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </div></td>
        <td style="text-align:center;color:var(--ps-text-secondary);">3</td>
      </tr>`,

    // Members leaderboard — Dame Chi Onwurah #1 expanded (used at step 13 for demo)
    members: `
      <tr class="index-standings-row index-row-open">
        <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">1</td>
        <td><div class="ps-member"><span class="ps-member__name">Dame Chi Onwurah</span></div></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <span class="ps-badge" style="background:rgba(87,81,120,0.15);color:#9b8fc9;border-color:#9b8fc955">MP</span>
        </div></td>
        <td style="text-align:center;color:var(--ps-text-secondary);">5</td>
      </tr>
      <tr class="index-act-row">
        <td colspan="4">
          <div class="master-act-list">
            <div class="master-act-item">
              <div class="master-act-meta">
                <span class="master-act-date">26/02/26</span>
                <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
              </div>
              <div class="master-act-body">
                <a href="https://hansard.parliament.uk/commons/2026-02-26/debates/7367518A-5089-4844-A2F4-610E55141556/productivity-technology#contribution-357C6F9E-72EC-4ADB-8335-9EE338C66717" target="_blank" rel="noopener" class="index-act-summary index-act-summary--link">Advocates for AI use in Parliament but demands it be secure, ethical and in public interest, while questioning Microsoft&#8217;s influence over Copilot&#8217;s development.</a>
              </div>
            </div>
            <div class="master-act-item">
              <div class="master-act-meta">
                <span class="master-act-date">24/02/26</span>
                <span class="ps-badge" style="background:rgba(248,113,113,0.15);color:#f87171;border-color:#f8717155">Hansard</span>
              </div>
              <div class="master-act-body">
                <a href="https://hansard.parliament.uk/commons/2026-02-24/debates/37A7D990-8218-4200-A6C7-4A3979188E7C/online-harm-child-protection#contribution-0E0B2B6D-079C-485A-8FA6-6765FBAB0AAD" target="_blank" rel="noopener" class="index-act-summary index-act-summary--link">Advocates for government regulation of online platforms to protect children from online harms, criticising Conservative inaction and the tech industry&#8217;s resistance to oversight.</a>
              </div>
            </div>
          </div>
        </td>
      </tr>
      <tr class="index-standings-row">
        <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">2</td>
        <td><div class="ps-member"><span class="ps-member__name">Baroness Kidron</span></div></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          <span class="ps-badge" style="background:rgba(156,163,175,0.15);color:#9ca3af;border-color:#9ca3af55">Crossbench</span>
          <span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </div></td>
        <td style="text-align:center;color:var(--ps-text-secondary);">4</td>
      </tr>
      <tr class="index-standings-row">
        <td style="text-align:center;font-weight:600;color:var(--ps-text-secondary);">3</td>
        <td><div class="ps-member"><span class="ps-member__name">Lord Leong</span></div></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          <span class="ps-badge" style="background:rgba(195,44,65,0.15);color:#e05567;border-color:#e0556755">Labour</span>
          <span class="ps-badge" style="background:rgba(134,30,50,0.15);color:#d4556b;border-color:#d4556b55">Peer</span>
        </div></td>
        <td style="text-align:center;color:var(--ps-text-secondary);">3</td>
      </tr>`,

    // Topic chips for the members index view (above leaderboard)
    indexTopicChips: `
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only ps-chip-topic-wrap--active">
        <button class="ps-chip ps-chip--active">All Topics</button>
      </span>
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only">
        <button class="ps-chip">AI Companies</button>
      </span>
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only">
        <button class="ps-chip">AI regulation</button>
      </span>
      <span class="ps-chip-topic-wrap ps-chip-topic-wrap--view-only">
        <button class="ps-chip">Biometrics</button>
      </span>`,

    // Audit summary — LLM-classified discards from scan #196
    auditSummary: `
      <div class="audit-count">
        <span class="count-badge discard-pill--procedural">15</span>
        <span>Procedural</span>
      </div>
      <div class="audit-count">
        <span class="count-badge discard-pill--off_topic">11</span>
        <span>Off-Topic</span>
      </div>
      <div class="audit-count">
        <span class="count-badge discard-pill--no_position">4</span>
        <span>No Position</span>
      </div>`,

    // 3 real discarded items from scan #196
    auditItems: `
      <div class="audit-header">
        <span>Name</span><span>Contribution</span><span>Reason discarded</span><span>Action</span>
      </div>
      <div class="audit-item">
        <span class="audit-member">Baroness Chakrabarti</span>
        <span class="audit-preview">To ask His Majesty&#8217;s Government what progress they have made in relation to the (1) implementation, and (2) outcomes, of the Child Poverty Strategy.</span>
        <span class="audit-reason">
          <span class="discard-pill discard-pill--off_topic discard-pill--list">Off-Topic</span>
          No topic keywords found in text.
        </span>
        <div class="audit-actions-dropdown">
          <button class="ps-btn ps-btn--ghost ps-btn--sm" disabled>&#8942;</button>
        </div>
      </div>
      <div class="audit-item">
        <span class="audit-member">Dame Chi Onwurah</span>
        <span class="audit-preview">There are direct flights from Newcastle to Dubai, and many Geordies in the region&#8230; Iran is a murderous, despotic state that has frequently threatened UK security, but the sight of bombs raining down across the Gulf will not make my constituents feel more secure&#8230;</span>
        <span class="audit-reason">
          <span class="discard-pill discard-pill--off_topic discard-pill--list">Off-Topic</span>
          No topic keywords found in text.
        </span>
        <div class="audit-actions-dropdown">
          <button class="ps-btn ps-btn--ghost ps-btn--sm" disabled>&#8942;</button>
        </div>
      </div>
      <div class="audit-item">
        <span class="audit-member">Baroness Kidron</span>
        <span class="audit-preview">To ask His Majesty&#8217;s Government what discussions they have had with United States counterparts about the sanctioning of British citizens Imran Ahmed and Clare Melford for their work on online safety.</span>
        <span class="audit-reason">
          <span class="discard-pill discard-pill--off_topic discard-pill--list">Off-Topic</span>
          No topic keywords found in text.
        </span>
        <div class="audit-actions-dropdown">
          <button class="ps-btn ps-btn--ghost ps-btn--sm" disabled>&#8942;</button>
        </div>
      </div>`,
  };

  // ── State snapshot ────────────────────────────────────────────────────────────

  let snap = null;

  function saveState() {
    const g = id => document.getElementById(id);
    snap = {
      badgeCls:                g('summaryStatusBadge').className,
      badgeHtml:               g('summaryStatusBadge').innerHTML,
      dateHtml:                g('summaryScanDate').innerHTML,
      dateDisp:                g('summaryScanDate').style.display,
      labelHtml:               g('progressLabel').innerHTML,
      labelDisp:               g('progressLabel').style.display,
      panelsDisp:              g('progressPanels').style.display,
      keywords:                g('keywordProgress').innerHTML,
      pipeline:                g('pipelineStats').innerHTML,
      srcHtml:                 g('sourceCirclesRow').innerHTML,
      srcDisp:                 g('sourceCirclesRow').style.display,
      resultsBody:             g('resultsBody').innerHTML,
      resultsPag:              g('resultsPagination').innerHTML,
      membersBody:             g('indexStandingsBody').innerHTML,
      membersPag:              g('indexStandingsPagination').innerHTML,
      auditList:               g('auditList').innerHTML,
      auditSummary:            g('auditSummary').innerHTML,
      mentionsDisp:            g('mentionsContent').style.display,
      membersDisp:             g('membersContent').style.display,
      auditDisp:               g('auditTabContent').style.display,
      resultsTab:              g('resultsTabBtn').className,
      auditTab:                g('auditTabBtn').className,
      mentionsBtn:             g('mentionsViewBtn').className,
      membersBtn:              g('membersViewBtn').className,
      selectorDisp:            g('resultsViewSelector').style.display,
      resultsSectionMinH:      g('results-section') ? g('results-section').style.minHeight : '',
      memberPillsHtml:         g('memberSelectedPills') ? g('memberSelectedPills').innerHTML : '',
      topicChipGroupHtml:      g('topicChipGroup') ? g('topicChipGroup').innerHTML : '',
      indexTopicChipsDisp:     g('indexTopicChips') ? g('indexTopicChips').style.display : '',
      indexTopicChipItemsHtml: g('indexTopicChipItems') ? g('indexTopicChipItems').innerHTML : '',
    };
  }

  function restoreState() {
    if (!snap) return;
    const g = id => document.getElementById(id);
    const s = snap;
    g('summaryStatusBadge').className        = s.badgeCls;
    g('summaryStatusBadge').innerHTML        = s.badgeHtml;
    g('summaryScanDate').innerHTML           = s.dateHtml;
    g('summaryScanDate').style.display       = s.dateDisp;
    g('progressLabel').innerHTML             = s.labelHtml;
    g('progressLabel').style.display         = s.labelDisp;
    g('progressPanels').style.display        = s.panelsDisp;
    g('keywordProgress').innerHTML           = s.keywords;
    g('pipelineStats').innerHTML             = s.pipeline;
    g('sourceCirclesRow').innerHTML          = s.srcHtml;
    g('sourceCirclesRow').style.display      = s.srcDisp;
    g('resultsBody').innerHTML               = s.resultsBody;
    g('resultsPagination').innerHTML         = s.resultsPag;
    g('indexStandingsBody').innerHTML        = s.membersBody;
    g('indexStandingsPagination').innerHTML  = s.membersPag;
    g('auditList').innerHTML                 = s.auditList;
    g('auditSummary').innerHTML              = s.auditSummary;
    g('mentionsContent').style.display       = s.mentionsDisp;
    g('membersContent').style.display        = s.membersDisp;
    g('auditTabContent').style.display       = s.auditDisp;
    g('resultsTabBtn').className             = s.resultsTab;
    g('auditTabBtn').className               = s.auditTab;
    g('mentionsViewBtn').className           = s.mentionsBtn;
    g('membersViewBtn').className            = s.membersBtn;
    g('resultsViewSelector').style.display   = s.selectorDisp;
    if (g('results-section'))      g('results-section').style.minHeight       = s.resultsSectionMinH;
    if (g('memberSelectedPills'))  g('memberSelectedPills').innerHTML          = s.memberPillsHtml;
    if (g('topicChipGroup'))       g('topicChipGroup').innerHTML               = s.topicChipGroupHtml;
    if (g('indexTopicChips'))      g('indexTopicChips').style.display          = s.indexTopicChipsDisp;
    if (g('indexTopicChipItems'))  g('indexTopicChipItems').innerHTML          = s.indexTopicChipItemsHtml;
    snap = null;
  }

  // ── Mock injectors ────────────────────────────────────────────────────────────

  function injectMemberPills() {
    const pills = document.getElementById('memberSelectedPills');
    if (pills) pills.innerHTML = M.memberPills;
  }

  function injectTopicChips() {
    const g = document.getElementById('topicChipGroup');
    if (g) g.innerHTML = M.topicChips;
  }

  function mockSummary() {
    const badge = document.getElementById('summaryStatusBadge');
    badge.className   = 'history-status completed';
    badge.textContent = 'Completed';
    const dt = document.getElementById('summaryScanDate');
    dt.textContent    = M.date;
    dt.style.display  = '';
    document.getElementById('progressLabel').style.display  = 'none';
    document.getElementById('progressPanels').style.display = '';
    document.getElementById('keywordProgress').innerHTML    = M.keywords;
    document.getElementById('pipelineStats').innerHTML      = M.pipeline;
    document.getElementById('sourceCirclesRow').innerHTML   = M.sources;
    document.getElementById('sourceCirclesRow').style.display = '';
    injectMemberPills();
  }

  function mockMentions() {
    if (typeof switchResultsTab  === 'function') switchResultsTab('results');
    if (typeof switchResultsView === 'function') switchResultsView('mentions');
    document.getElementById('resultsBody').innerHTML       = M.mentions;
    document.getElementById('resultsPagination').innerHTML = '';
    const rs = document.getElementById('results-section');
    if (rs) { rs.style.minHeight = '560px'; rs.style.paddingBottom = ''; }
  }

  function mockMembers() {
    if (typeof switchResultsTab  === 'function') switchResultsTab('results');
    if (typeof switchResultsView === 'function') switchResultsView('members');
    document.getElementById('indexStandingsBody').innerHTML       = M.members;
    document.getElementById('indexStandingsPagination').innerHTML = '';
    const rs = document.getElementById('results-section');
    if (rs) { rs.style.minHeight = '560px'; rs.style.paddingBottom = '400px'; }
    // Inject topic chips above the leaderboard
    const chips = document.getElementById('indexTopicChips');
    const items = document.getElementById('indexTopicChipItems');
    if (chips) chips.style.display = '';
    if (items) items.innerHTML = M.indexTopicChips;
  }

  function mockAudit() {
    if (typeof switchResultsTab === 'function') switchResultsTab('audit');
    document.getElementById('auditSummary').innerHTML = M.auditSummary;
    document.getElementById('auditList').innerHTML    = M.auditItems;
    const rs = document.getElementById('results-section');
    if (rs) { rs.style.minHeight = '560px'; rs.style.paddingBottom = '400px'; }
  }

  // Preload the full mock state immediately on tour start — all sections visible
  // at once, as if the user had just clicked on this scan in the history panel.
  function preloadMockState() {
    // Expand all relevant sections upfront
    if (typeof expandSection === 'function') {
      expandSection('progress-section');
      expandSection('results-section');
      expandSection('history-section');
    }

    // Inject topic chips into the filter bar
    injectTopicChips();

    // Load summary panel (also calls injectMemberPills internally)
    mockSummary();

    // Populate results — start with the Mentions tab visible
    if (typeof switchResultsTab  === 'function') switchResultsTab('results');
    if (typeof switchResultsView === 'function') switchResultsView('mentions');
    document.getElementById('resultsBody').innerHTML       = M.mentions;
    document.getElementById('resultsPagination').innerHTML = '';

    // Populate members leaderboard (collapsed — visible when user reaches that step)
    document.getElementById('indexStandingsBody').innerHTML       = M.membersCollapsed;
    document.getElementById('indexStandingsPagination').innerHTML = '';
    const chips = document.getElementById('indexTopicChips');
    const items = document.getElementById('indexTopicChipItems');
    if (chips) chips.style.display = '';
    if (items) items.innerHTML = M.indexTopicChips;

    // Populate audit tab (in background)
    document.getElementById('auditSummary').innerHTML = M.auditSummary;
    document.getElementById('auditList').innerHTML    = M.auditItems;

    // Ensure results section has enough height to look populated
    const rs = document.getElementById('results-section');
    if (rs) rs.style.minHeight = '560px';
  }

  // ── Topic mock popover ────────────────────────────────────────────────────────

  function showTopicPopover() {
    const anchor = document.getElementById('topic-toggles');
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // Predict post-scroll bottom: scrollTo:'top' puts anchor top at ~80px from viewport
    const predictedBottom = 80 + rect.height;

    const p = document.createElement('div');
    p.className = 'topic-popover';
    p.style.cssText = [
      'position:fixed',
      'z-index:2004',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity 0.3s ease',
      `top:${predictedBottom + 8}px`,
    ].join(';');
    p.innerHTML = `
      <div class="topic-popover__header">
        <span class="topic-popover__title">AI regulation</span>
        <button class="topic-popover__delete" disabled style="opacity:0.35;">Delete</button>
      </div>
      <div class="topic-popover__keywords">
        <span class="keyword-chip">AI act<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">AI bill<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">AI legislation<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">AI regulation<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">CMA<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">ICO<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">Ofcom<span class="remove-kw">&times;</span></span>
        <span class="keyword-chip">digital markets<span class="remove-kw">&times;</span></span>
      </div>
      <div class="topic-popover__add">
        <input class="ps-input ps-input--sm" placeholder="Add keyword\u2026" disabled style="opacity:0.5;">
        <button class="ps-btn ps-btn--primary ps-btn--sm" disabled style="opacity:0.5;">Add</button>
      </div>`;
    document.body.appendChild(p);
    // Centre horizontally on the anchor element (same as standard tooltip positioning)
    const centreLeft = rect.left + rect.width / 2 - p.offsetWidth / 2;
    p.style.left = Math.max(16, Math.min(centreLeft, window.innerWidth - p.offsetWidth - 16)) + 'px';
    els.mockPopover = p;

    // Fade in after tooltip has rendered (scroll ~420ms + RAF buffer)
    mockPopoverTimer = setTimeout(() => {
      if (!els.mockPopover) return;
      const r = anchor.getBoundingClientRect(); // re-measure post-scroll
      els.mockPopover.style.top     = (r.bottom + 8) + 'px';
      els.mockPopover.style.opacity = '1';
    }, 600);
  }

  function hideTopicPopover() {
    clearTimeout(mockPopoverTimer);
    mockPopoverTimer = null;
    if (els.mockPopover) {
      els.mockPopover.remove();
      els.mockPopover = null;
    }
  }

  // ── Scroll lock ───────────────────────────────────────────────────────────────

  function preventScroll(e) { e.preventDefault(); }

  function lockScroll() {
    document.addEventListener('wheel',     preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });
  }

  function unlockScroll() {
    document.removeEventListener('wheel',     preventScroll);
    document.removeEventListener('touchmove', preventScroll);
  }

  // ── Step definitions ──────────────────────────────────────────────────────────

  const STEPS = [
    // 0 ── Intro
    {
      target:      '#controls',
      noSpotlight: true,
      title:       'Welcome to ParliScan',
      body:        'ParliScan searches UK parliamentary records to surface activity relating to relevant topics or politicians.',
      position:    'bottom',
    },
    // 1 ── Date picker & scan trigger
    {
      target:   '#controls',
      title:    'Select date range',
      body:     'Use the date picker to select the period you want to monitor. We recommend starting small to begin with (2\u20133 days) to get a sense of scan size.',
      position: 'bottom',
    },
    // 2 ── Source filter
    {
      target:   '#source-toggles',
      title:    'Filter by source',
      body:     'Toggle which parliamentary sources to include in the scan. All are selected by default — deselect any you don\'t need.',
      position: 'bottom',
    },
    // 3 ── Topic filter
    {
      target:   '#topic-toggles',
      title:    'Filter by topic',
      body:     'Select which of your topics to scan for. Each result will be tagged with its matching topic so you can filter and compare afterwards.<div class="tour-body-warning"><strong>Warning:</strong> Start with one or two topics and a narrow date range. Scanning many at once uses more AI classification credits and takes longer to complete.</div>',
      position: 'bottom',
      onEnter:  injectTopicChips,
    },
    // 4 ── Topic keyword editing (popover below topics, tooltip below popover)
    {
      target:        '#topic-toggles',
      title:         'Editing topics &amp; keywords',
      body:          'Each topic contains specific keywords, which ParliScan will use to conduct the search.<br><br>Click the small arrow next to any topic chip to open its keyword panel. You can add or remove keywords based on what subtopics are important to you.',
      position:      'bottom',
      scrollTo:      'top',
      anchorPopover: true,
      onEnter:       showTopicPopover,
      onLeave:       hideTopicPopover,
    },
    // 5 ── Member filter
    {
      target:   '#member-filter-group',
      title:    'Filter by member or group',
      body:     'Optionally narrow the scan to a specific MP, Peer, or a saved group (configured in the Groups tab). Leave this blank to scan across all members.',
      position: 'bottom',
      onEnter:  injectMemberPills,
    },
    // 6 ── Summary overview
    {
      target:        '#progress-section',
      title:         'Summary',
      body:          'After a scan is triggered, the summary section provides an overview of the scan\'s status.',
      position:      'bottom',
      scrollTo:      'top',
      expandSection: 'progress-section',
      onEnter:       mockSummary,
    },
    // 7 ── Keyword chip breakdown
    {
      target:   '#keywordProgress',
      title:    'Keyword results',
      body:     'Each topic and its keywords are shown here. A keyword pill will turn purple when it\'s being searched, and green once the search is complete. The number of matches found for each term is displayed next to it. A tick next to the topic means all keywords under it have been processed.',
      position: 'bottom',
      scrollTo: 'top',
    },
    // 8 ── Pipeline: Keyword Results box
    {
      target:   '#tour-pipe-1',
      title:    'Keyword results',
      body:     'The total number of parliamentary items that matched at least one of your keywords across the selected sources and date range. This is the starting pool before AI classification begins.',
      position: 'bottom',
      scrollTo: 'top',
    },
    // 9 ── Pipeline: Classified box
    {
      target:   '#tour-pipe-2',
      title:    'Classified',
      body:     'Keyword matches are sent to the AI classifier. The counter shows how many have been processed so far. The classifier reads each item to determine whether it relates to your topic.',
      position: 'bottom',
      scrollTo: 'top',
    },
    // 10 ── Pipeline: Relevant box
    {
      target:   '#tour-pipe-3',
      title:    'Relevant',
      body:     'Items confirmed relevant to your topic appear in the Results tab below.',
      position: 'bottom',
      scrollTo: 'top',
    },
    // 11 ── Pipeline: Discarded box
    {
      target:   '#tour-pipe-4',
      title:    'Discarded',
      body:     'Items the classifier determined to be not relevant are filtered out and can be viewed in the Discarded Items section below.',
      position: 'bottom',
      scrollTo: 'top',
    },
    // 12 ── Results: Mentions view
    {
      target:           '#results-section',
      title:            'Results — Mentions view',
      body:             'The Mentions view shows every individual parliamentary match, including member, party, topic, an AI-generated summary, and direct quote. Click the hyperlinked quote to visit the source from where it was taken.',
      position:         'bottom',
      scrollTo:         'top',
      anchorToViewport: { v: 'bottom', h: 'center' },
      expandSection:    'results-section',
      onEnter:          mockMentions,
    },
    // 13 ── Results: Members view
    {
      target:           '#results-section',
      title:            'Results — Members view',
      body:             'Switch to Members view to see parliamentarians ranked by total mention count. Click any row to expand a member\'s activities and use the topic chips above the table to filter by issue.',
      position:         'bottom',
      scrollTo:         'top',
      anchorToViewport: { v: 'bottom', h: 'center' },
      onEnter:          mockMembers,
    },
    // 14 ── Results: Discarded items
    {
      target:           '#results-section',
      title:            'Discarded items',
      body:             'The Discarded Items tab shows everything the AI reviewed but filtered out, with a reason for each. Use the action button to manually promote any item back into Results.',
      position:         'bottom',
      scrollTo:         'top',
      anchorToViewport: { v: 'bottom', h: 'center' },
      onEnter:          mockAudit,
    },
    // 15 ── Scan history
    {
      target:           '#history-section',
      title:            'Scan history',
      body:             'Every scan is saved here. Click any past scan to reload its results.',
      position:         'bottom',
      scrollTo:         'top',
      anchorToViewport: { v: 'bottom', h: 'center' },
      expandSection:    'history-section',
    },
  ];

  // ── Module state ──────────────────────────────────────────────────────────────

  let active           = false;
  let currentStep      = 0;
  let firstRender      = true;
  let els              = {};
  let mockPopoverTimer = null;

  // ── Public entry point ────────────────────────────────────────────────────────

  function startTour() {
    if (active) return;
    active      = true;
    currentStep = 0;
    firstRender = true;
    saveState();
    lockScroll();
    buildDOM();
    preloadMockState();
    show(0);
  }

  // ── DOM construction ──────────────────────────────────────────────────────────

  function buildDOM() {
    els.overlay   = make('div',    'tour-overlay');
    els.spotlight = make('div',    'tour-spotlight');
    els.tooltip   = make('div',    'tour-tooltip');
    els.closeBtn  = make('button', 'tour-close-btn');

    els.spotlight.style.visibility = 'hidden';
    els.tooltip.style.visibility   = 'hidden';

    els.closeBtn.innerHTML = '&times;';
    els.closeBtn.setAttribute('aria-label', 'Close tour');
    els.closeBtn.addEventListener('click', end);

    const trigger = document.getElementById('tourTriggerBtn');
    if (trigger) trigger.style.display = 'none';

    document.body.append(els.overlay, els.spotlight, els.tooltip, els.closeBtn);
    document.addEventListener('keydown', onKey);
  }

  function make(tag, cls) {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && r.height > 0;
  }

  // ── Step rendering ────────────────────────────────────────────────────────────

  function show(index) {
    const step = STEPS[index];

    if (typeof step.onEnter === 'function') step.onEnter();
    if (step.expandSection && typeof expandSection === 'function') {
      expandSection(step.expandSection);
    }

    if (step.noSpotlight) {
      const target = step.target ? document.querySelector(step.target) : null;
      setTimeout(() => renderStep(target, step, index), 30);
      return;
    }

    const expandDelay = step.expandSection ? 180 : 0;

    setTimeout(() => {
      const target = document.querySelector(step.target);
      if (!target) {
        console.warn('[Tour] target not found:', step.target);
        return;
      }

      let scrollWait;
      if (step.scrollTo === 'top') {
        const absTop = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, absTop - 80), behavior: 'smooth' });
        scrollWait = 420;
      } else {
        const alreadyVisible = isInViewport(target);
        if (!alreadyVisible) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        scrollWait = alreadyVisible ? 30 : 420;
      }

      setTimeout(() => renderStep(target, step, index), scrollWait);
    }, expandDelay);
  }

  function renderStep(target, step, index) {
    const PAD     = 10;
    const total   = STEPS.length;
    const isFirst = firstRender;

    // ── Spotlight ─────────────────────────────────────────────────────────────
    if (isFirst) els.spotlight.style.transition = 'none';

    if (step.noSpotlight || !target) {
      Object.assign(els.spotlight.style, {
        top:    (window.innerHeight / 2) + 'px',
        left:   (window.innerWidth  / 2) + 'px',
        width:  '0px',
        height: '0px',
      });
    } else {
      const rect = target.getBoundingClientRect();
      const sh = step.spotlightHeight !== undefined ? step.spotlightHeight : rect.height;
      Object.assign(els.spotlight.style, {
        top:    (rect.top  - PAD) + 'px',
        left:   (rect.left - PAD) + 'px',
        width:  (rect.width  + PAD * 2) + 'px',
        height: (sh          + PAD * 2) + 'px',
      });
    }

    if (isFirst) {
      els.spotlight.offsetHeight;
      els.spotlight.style.transition = '';
      els.spotlight.style.visibility = 'visible';
    }

    // ── Tooltip HTML ──────────────────────────────────────────────────────────
    const isLast = index === total - 1;
    els.tooltip.innerHTML = `
      <div class="tour-tooltip__header">
        <span class="tour-tooltip__title">${step.title}</span>
        <span class="tour-tooltip__counter">${index + 1}\u2009/\u2009${total}</span>
      </div>
      <div class="tour-tooltip__body">${step.body}</div>
      <div class="tour-tooltip__footer">
        <button class="tour-btn" id="t-prev"${index === 0 ? ' disabled' : ''}>Back</button>
        <div class="tour-dots">
          ${STEPS.map((_, i) => `<span class="tour-dot${i === index ? ' active' : ''}"></span>`).join('')}
        </div>
        <button class="tour-btn tour-btn--primary${isLast ? ' tour-btn--finish' : ''}" id="t-next">
          ${isLast ? 'Finish' : 'Next'}
        </button>
      </div>`;

    document.getElementById('t-prev').addEventListener('click', () => navigate(-1));
    document.getElementById('t-next').addEventListener('click', () => navigate(1));

    // ── Tooltip position ──────────────────────────────────────────────────────
    els.tooltip.style.visibility = 'hidden';
    els.tooltip.style.top        = '-9999px';
    els.tooltip.style.left       = '-9999px';

    requestAnimationFrame(() => {
      const TW  = els.tooltip.offsetWidth  || 360;
      const TH  = els.tooltip.offsetHeight || 180;
      const MAR = 16;

      let top, left;

      if (step.anchorPopover && els.mockPopover) {
        // Position tooltip below the mock popover
        const pr = els.mockPopover.getBoundingClientRect();
        top  = pr.bottom + MAR;
        left = pr.left + pr.width / 2 - TW / 2;
        left = Math.max(MAR, Math.min(left, window.innerWidth - TW - MAR));
        top  = Math.min(top, window.innerHeight - TH - MAR);
        top  = Math.max(MAR, top);
      } else if (step.anchorToViewport) {
        const a = step.anchorToViewport;
        top  = a.v === 'bottom' ? window.innerHeight - TH - MAR
             : a.v === 'center' ? (window.innerHeight - TH) / 2
             : MAR;
        left = a.h === 'right'  ? window.innerWidth - TW - MAR
             : a.h === 'center' ? (window.innerWidth - TW) / 2
             : MAR;
      } else if (target) {
        const rect = target.getBoundingClientRect();
        if (step.position === 'bottom' && rect.bottom + MAR + TH < window.innerHeight) {
          top = rect.bottom + MAR;
        } else if (rect.top - MAR - TH > 0) {
          top = rect.top - MAR - TH;
        } else {
          top = rect.bottom + MAR;
        }
        left = rect.left + rect.width / 2 - TW / 2;
        left = Math.max(MAR, Math.min(left, window.innerWidth - TW - MAR));
        top  = Math.min(top, window.innerHeight - TH - MAR);
        top  = Math.max(MAR, top);
      } else {
        top  = (window.innerHeight - TH) / 2;
        left = (window.innerWidth  - TW) / 2;
      }

      if (isFirst) els.tooltip.style.transition = 'none';
      els.tooltip.style.top        = top  + 'px';
      els.tooltip.style.left       = left + 'px';
      els.tooltip.style.visibility = 'visible';
      if (isFirst) {
        els.tooltip.offsetHeight;
        els.tooltip.style.transition = '';
        firstRender = false;
      }
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  function navigate(dir) {
    const step = STEPS[currentStep];
    if (typeof step.onLeave === 'function') step.onLeave();
    const next = currentStep + dir;
    if (next < 0) return;
    if (next >= STEPS.length) { end(); return; }
    currentStep = next;
    show(currentStep);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1);  }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navigate(-1); }
    if (e.key === 'Escape')                               end();
  }

  // ── Teardown ──────────────────────────────────────────────────────────────────

  function end() {
    const step = STEPS[currentStep];
    if (typeof step.onLeave === 'function') step.onLeave();

    active = false;
    unlockScroll();
    document.removeEventListener('keydown', onKey);
    Object.values(els).forEach(e => e && e.remove());
    els = {};

    restoreState();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const trigger = document.getElementById('tourTriggerBtn');
    if (trigger) trigger.style.display = '';
  }

  window.startTour = startTour;

})();
