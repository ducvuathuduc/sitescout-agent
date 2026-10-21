# Track 2 — Prior art & winning patterns (SiteScout)

**Research date:** 2026-10-20 · **Method:** public web research (search + text reads only). Every project below is real and cited with its verified URL. Nothing is fabricated. Star/fork counts were observed on the research date and will drift.

---

## 1. The bar: what this program actually rewards

Source of truth: the program page — https://www.geoapify.com/open-geospatial-program/

- **Rewards:** €300 sponsorship for selected completed projects + **€500 best tutorial** + **€500 best app/agent**. Both bonuses are won on documentation and presentation quality, not just code.
- **Required deliverables for final review:**
  1. Public GitHub repo with meaningful Geoapify OpenAPI/MCP use, MIT preferred license
  2. Runnable application/agent/script or reproducible workflow (hosted demo optional)
  3. README: architecture, setup, configuration, step-by-step run instructions
  4. **Public tutorial/walkthrough** of how it was built and how Geoapify was used
  5. Prompts, agent instructions, or AI workflow + what worked / what was difficult
  6. **Concrete feedback and suggestions for Geoapify's OpenAPI specs or MCP tools**
- **"Especially welcome":** configuration tutorials **with screenshots** for different AI clients + example prompts. Keys hidden in screenshots.
- **Hard gates:** one formal fix round; broken links, non-working run steps, or missing setup instructions **may disqualify from rewards**. QA checklist required: run path works without undocumented fixes, readable structured code, documented deps/build, known limitations listed.
- **Rights:** participants keep authorship; Geoapify may reference/copy/showcase code and republish tutorials **with attribution** — i.e., the tutorial should be written republish-ready.
- **Selection:** competitive, discretionary, no fixed number of projects per batch. Final payout eligibility verified at payout time.

**Key inference:** the bonus structure (€500 + €500 on top of €300 base) means the review rewards *reproducibility + tutorial quality + feedback depth* at least as much as raw functionality. SiteScout should budget roughly equal effort for build / docs / tutorial / feedback.

---

## 2. Batch #1 (Maps & Places) — findings

- Announced **14 May 2026** on Geoapify's news page: https://www.Geoapify.com/news-and-updates/ — "Batch #1 of the Geoapify Open Geospatial Program is now open… focuses on practical **maps and places** projects built with Geoapify APIs."
- Applications closed **June 10, 2026, 23:59 UTC**. Theme per the program page: map rendering, location search, geocoding, place discovery.
- **Honest finding — no public Batch #1 showcase exists (as of 2026-10-20).** Four targeted searches across geoapify.com, its blog/news, and social mentions found **no published list of Batch #1 selected projects, winners, or showcased work**. The program page keeps Batch #1 as a one-paragraph historical record only. The news page has no wrap-up post.
- **Why this matters for SiteScout:**
  1. There is **no Batch #1 submission to beat on GitHub** — the competitive bar for Batch #2 is set by the written requirements, not by a predecessor's repo.
  2. It is a **visibility gap we can exploit**: "promotion through Geoapify channels" is an explicit reward, and a submission engineered to be *showcase-ready* (hero visual, runnable demo, republishable tutorial) is exactly what a program with no prior showcase material needs. Make Geoapify's job of promoting us trivial.

---

## 3. Public Geoapify MCP demos & agents

### 3a. burningion/geoapify-mcp — the closest existing Geoapify MCP demo
https://github.com/burningion/geoapify-mcp
- Author: Kirk Kaiser (burningion). **4 stars, 1 fork, 8 commits.** Python/FastMCP. Two tools: `get_gps_coordinates`, `create_map_from_geojson`.
- What it does right: README shows **copy-paste example prompts** ("can you create a geojson of the following locations…") with the **actual resulting output** (attached GeoJSON + generated map image `temp_map.png` used as the README hero image). Claude Desktop config JSON included verbatim.
- What it lacks: no agent workflow, no tutorial, no feedback to Geoapify, thin docs, Mac-only map display. 
- **Notable:** even this small 2-tool demo earned a full third-party deep-dive write-up: https://skywork.ai/skypage/en/geoapify-mcp-server-developer-dive/1981519390313734144 — proof that *a runnable demo with visible output gets coverage*. SiteScout's beat: full agent loop + scoring pipeline + tutorial + feedback where this has a README only.

### 3b. Composio Geoapify MCP toolkit — the "client setup guide" pattern
https://composio.dev/toolkits/geoapify
- Per-framework setup guides (Vercel AI SDK, OpenAI Agents SDK, LangChain, LlamaIndex, Claude Code) with copy-paste TypeScript, plus a **live Tool Router playground** ("type what you want done — watch it run").
- **Pattern to borrow:** the program explicitly wants AI-client setup guides; Composio's format (install → session → connect → one example prompt → "what's happening" explainer) is the template. A live-try element (even a recorded GIF if we can't host) dramatically lowers the reviewer's effort.

### 3c. Official Geoapify MCP docs — the quality bar for "how to connect + what to ask"
https://www.geoapify.com/mcp/
- **11 tools** documented in a category table (geocoding ×3, places ×2, routing ×2, geometry ×4), both endpoints (`https://api.geoapify.com/v1/mcp` and EU `https://api-eu.geoapify.com/v1/mcp`), `x-api-key` header auth, protocol version `2025-06-18`.
- **Per-tool example prompts** in natural language + one full raw JSON-RPC request/response example (pharmacy search, with credit-cost note: "1 credit per up to 20 returned places").
- **Pattern to borrow:** prompt → tool call → real response → cost note. Our tutorial should mirror this exact cadence for the SiteScout agent loop.

### 3d. JustRouting "Build a Delivery AI Agent with MCP and Routing APIs" (dev.to) — the tutorial format to beat
https://dev.to/justrouting/build-a-delivery-ai-agent-with-mcp-and-routing-apis-aa4
- Structure: problem framing ("LLM = reasoning, routing engine = transportation intelligence") → **mermaid architecture diagram** (renders natively on GitHub/dev.to) → stack → agent capabilities list → Southeast Asia routing data angle.
- **Pattern to borrow:** the conceptual split diagram (what the LLM decides vs. what the geospatial layer computes) is the single most effective explanatory device. SiteScout's equivalent: *agent explores via MCP → TypeScript pipeline scores deterministically → every score cites its evidence*. One diagram, placed above the fold in README + tutorial.
- Note: it uses a *different* MCP server (JustRouting), not Geoapify — the Geoapify-specific agent tutorial slot is still open.

### 3e. Geoapify's own dev.to channel — a legit distribution venue
https://dev.to/geoapify-maps-api/google-places-api-alternatives-which-poi-api-should-you-use-in-2026-hd4
- Geoapify publishes as `geoapify-maps-api` on dev.to. Since Geoapify may republish our tutorial with attribution, writing it in dev.to-friendly format (headers, code blocks, embedded visuals, no broken links) makes republication frictionless — which serves the €500 tutorial bonus directly.

### 3f. OpenStreetMap MCP Server (jagan-shanmugam) — the closest full geospatial MCP server project
https://lobehub.com/ar/mcp/jagan-shanmugam-open-streetmap-mcp
- Published 2026-03-07. 12 tools + 2 resources. **Presented as demo scenarios** (meeting-point optimization, neighborhood analysis, parking search) with images — not as a tool list.
- Ships `examples/` with **two runnable clients** (`client.py` basic + `llm_client.py` LLM integration), Claude Desktop JSON config, local-testing docs, MCP Inspector debugging guide, PyPI publishing.
- **Pattern to borrow:** *scenarios beat tool lists*. SiteScout should present "score 3 candidate districts for a coffee shop in Thủ Đức" as the demo scenario, not "here are our N tools."

### 3g. matbel91765/gis-mcp-server — focused scope beats thin coverage
https://enterprisedna.co/directories/mcp/matbel91765-gis-mcp-server/
- 3 stars, MIT. Geocoding + routing + elevation + spatial analysis + **file I/O for Shapefile/GeoJSON/GeoPackage**. Positioned as "basic geospatial analysis and file handling for AI agents."
- **Pattern:** a narrow, well-defined job ("basic geospatial analysis for agents") with the file formats agents actually need. SiteScout's narrow job: *evidence-traced site scoring*. Don't sprawl.

### 3h. geocode-mcp — the "verification is visible" README
https://pypi.org/project/geocode-mcp/0.1.0/
- README leads with features → quick start → **full test suite** (pytest, coverage) → project-structure tree → per-client integration guides (Cursor, VSCode) → Makefile commands.
- **Pattern to borrow:** make verification *visible in the README* (test command + expected output). The program's QA section explicitly wants "core flows tested (manual test checklist or automated tests)" — show the checklist passing.

---

## 4. Traction patterns from outside Geoapify (what GitHub-trending-grade looks like)

### 4a. github/github-mcp-server — the reference MCP server README
https://github.com/github/github-mcp-server · **33,771 stars · 5,375 forks · 85 releases** (observed 2026-10-20)
- README architecture: **Use cases (5 bullets) → Remote vs Local → one-click install buttons per host (badge images) → toolset configuration → Read-only & Lockdown modes → Security → Contributing.**
- Patterns to steal:
  1. **One-click install buttons as images** at the top — zero-friction adoption beats paragraphs.
  2. **Remote + local options** documented side by side (we can mirror: "run against live Geoapify MCP" vs "run the deterministic pipeline offline with fixtures").
  3. **Safety as a feature section** (read-only/lockdown modes) — our equivalent: "evidence-traced: every score links its sources; read-only mode makes no API writes."
  4. **`docs/` directory** for anything longer than README; Go-module library usage for programmatic consumers.

### 4b. modelcontextprotocol/servers — the canonical reference repo
https://github.com/modelcontextprotocol/servers · **91,383 stars · 11,821 forks**
- README: reference-server catalog → **getting started with verbatim copy-paste client configs** (Claude Desktop JSON) → **platform gotchas documented** (the Windows `cmd /c` npx wrapper) → "Creating Your Own Server" → community → star CTA.
- Patterns to steal:
  1. **Copy-paste configs that work verbatim**, including the ugly platform edge cases — reviewers forgive complexity they can paste.
  2. **Catalog structure**: one-line description per component with a link; our tools/scoring criteria deserve the same table.
  3. End with a **community/support section** — signals the project is alive and maintained.

### 4c. Demo-packaging patterns (from developer-tool demo guides)
- **File organization** (`docs/demo/demo.gif` 5–10s primary + `docs/screenshots/` + `docs/DEMO.md`) and a **platform matrix** (GitHub README: GIF + screenshots, <10MB, 800×600; YouTube 3–10 min with chapters; X <2:20 square; LinkedIn with captions; Reddit no-marketing-speak): https://deepwiki.com/jasoncobra3/LLM_Red_Teaming/9.3-creating-demos-and-documentation
- **Terminal GIFs via asciinema + agg**: clear terminal, short, dark theme, one task per GIF, ~1.3× speed: https://ostechnix.com/create-animated-gifs-terminal-linux-asciinema/
- **README GIF/SVG embeds** ("a GIF is worth even more" than a screenshot; show-don't-tell; install stupid simple): https://dev.to/brpaz/make-your-project-readme-file-stand-out-with-animated-gifs-svgs-4kpe
- **Demo video craft** (published 2026-10-17, current): 60–90s for the core workflow; **start with the result, not the architecture**; put the install command + smallest working example *next to* the video; never show real API keys; large font, check readability on a phone: https://dev.to/demovexa/how-to-demo-a-developer-tool-cli-or-api-on-video-1108

---

## 5. Visual demos — formats & quality bars that win attention

*Synthesis of §3–4 evidence, focused on what a geospatial agent project should show and how.*

### 5a. The README hero visual (above the fold)
- **The output IS the hero.** burningion's README puts the generated map (`temp_map.png`) directly under the title — a visitor understands the project in 3 seconds without reading a word. For SiteScout the hero should be **the scored-candidates map or ranked table with evidence links**, generated by a real run — never a mockup. Common failure mode (per demovexa): showing output the tool doesn't actually produce.
- **Quality bar:** real output, legible at GitHub's rendered width, dark-or-neutral theme consistent with the rest of the docs, no API keys visible.

### 5b. Animated GIF — the primary demo (5–10 seconds)
- The dominant format for developer tools on GitHub: instant load, no player, embeds in Markdown. Keep it **<10MB, ~800×600**, one task per GIF, dark terminal, clear screen before recording, ~1.3× speed (asciinema → `agg` workflow).
- **SiteScout's GIF script:** prompt → agent calls Geoapify MCP tools (visible tool-call lines) → TypeScript pipeline prints the scored ranking table with evidence citations → map renders. Under 10 seconds, no pauses, no unrelated commands.
- Place it in `docs/demo/demo.gif` + embed at the top of the README and the tutorial.

### 5c. Interactive map vs. static screenshot
- For geospatial work a static screenshot under-sells: the strongest format is an **interactive map the reviewer can pan/zoom**. Options in ascending effort:
  1. Geoapify **static map image** in README (zero infra, always renders).
  2. A committed **self-contained Leaflet/Folium HTML artifact** (`docs/demo/sitescout-demo.html`) — opens from the repo, no server needed.
  3. A hosted demo page (optional per program rules; only if free-tier hosting is reliable).
- Minimum bar: every candidate site on the map links/numbers back to the evidence table. A pretty map with no traceability is decoration; a map where each pin cites its sources is the product.

### 5d. Sample-output screenshots (the evidence story)
- Screenshot the **ranked output table with evidence citations visible** — this is SiteScout's differentiator made tangible. Include one "why site A beat site B" close-up (score breakdown + cited tool calls). This single image does more for the €500 app/agent bonus than any architecture paragraph.

### 5e. Architecture diagram (mermaid)
- One mermaid flowchart, GitHub/dev.to-native rendering, no external image hosting: **User prompt → Agent (Geoapify MCP: geocode, places, routing, isolines) → TypeScript scoring pipeline (deterministic) → evidence-traced ranking + map**. Mirrors the JustRouting "LLM decides / engine computes" split that made their tutorial work.

### 5f. AI-client config tutorials with screenshots (explicitly requested by the program)
- Per client (Claude Code `.mcp.json`, Cursor, ChatGPT): numbered steps, **screenshots with keys redacted**, one verified example prompt, and the resulting tool-use trace. The program page calls these out as "especially welcome" — they are the cheapest path to looking like the strongest submission.

### 5g. Platform matrix (legit distribution, no engagement farming)
| Surface | Format | Notes |
|---|---|---|
| GitHub README | GIF + hero image + mermaid | <10MB GIF, 800×600, real output only |
| dev.to tutorial | Embedded GIF + code blocks + diagram | dev.to-native; Geoapify may republish with attribution |
| X / LinkedIn launch | <2:20 square video, captions | Show the result in the first 3 seconds |
| YouTube (optional) | 3–10 min walkthrough, chapter timestamps | Only if it adds beyond the GIF |
| MCP registries / awesome lists | Listing after the quality bar is met | No fake stars, bots, or engagement farming — ever |
| GitHub Release Radar | Submit the release for consideration | Legit visibility channel: https://www.scien.cx/2021/11/30/get-your-open-source-project-featured-on-github/ |
| Grant aggregators | devgrantsdaily et al. | The program itself is listed at https://devgrantsdaily.com/ — being listed where applicants look is legitimate |

### 5h. Visual anti-patterns to avoid
Starting with architecture instead of the result · messy real-project paths on screen · faked or cherry-picked output · silent static terminal footage · no copyable commands next to the video · real API keys anywhere · GIFs over 10MB or longer than ~10s for the primary demo.

---

## 6. "What strong looks like" — checklist for a Batch #2 submission

Mapped 1:1 to the program's review criteria:

- [ ] **Runnable in <10 min** from README alone (copy-paste install + config + one command). Reviewers must not need undocumented fixes.
- [ ] **Meaningful Geoapify use, both tracks**: agent explores via MCP tools (geocode, places, routing, isolines) **and** the TypeScript pipeline is generated/typed from the OpenAPI specs — the "Combine OpenAPI + MCP" track, with a written explanation of which layer does what.
- [ ] **README**: one-liner → hero visual → GIF → quickstart → architecture diagram → tools/scoring table → per-client MCP setup → tests → limitations.
- [ ] **Tutorial/walkthrough published** (dev.to-friendly), including: the prompts used, what the AI got right, what needed human correction, lessons learned.
- [ ] **Prompts + agent instructions committed** in-repo (e.g., `prompts/`), with notes on difficulty.
- [ ] **Concrete Geoapify feedback**: numbered, specific suggestions on OpenAPI specs and MCP tools (schema gaps, naming, missing operations, error messages) — this is explicitly scored content, not an afterthought.
- [ ] **QA evidence**: test command + expected output in README; manual checklist marked done; known limitations + edge cases listed.
- [ ] **License**: MIT. **No secrets** committed (demo key only if Geoapify provides one for that purpose; private keys via env).
- [ ] **Versioned**: tagged release / commit hash recorded for the final submission email.
- [ ] **Showcase-ready**: hero visual, GIF, republishable tutorial — so Geoapify can promote it with zero extra work.

---

## 7. Borrow / beat list for SiteScout

**Borrow (proven patterns):**
1. burningion's **prompt → real output in README** cadence — but with a full agent loop, not two tools.
2. Geoapify MCP docs' **per-tool example prompts + cost notes** — mirror for our agent's tool calls.
3. JustRouting's **"LLM decides / engine computes" diagram** — ours: "agent explores via MCP / pipeline scores deterministically, every score cited."
4. Composio's **per-framework/per-client setup guides** with "what's happening" explainers.
5. OSM MCP server's **demo scenarios + `examples/` runnable clients** — present "score 3 districts in Thủ Đức" as a scenario.
6. geocode-mcp's **visible test suite** in README.
7. github-mcp-server's **one-click installs + safety-as-feature** ("evidence-traced, read-only by default").
8. modelcontextprotocol/servers' **verbatim copy-paste configs incl. platform gotchas**.

**Beat (gaps in the prior art):**
1. **No existing Geoapify MCP agent does end-to-end scoring with evidence traces** — burningion stops at geocoding; Composio stops at setup guides. The full loop (explore → score → cite → map) is unclaimed.
2. **No Geoapify-specific agent tutorial exists** on dev.to — the €500 tutorial slot has no incumbent.
3. **No Batch #1 public showcase** to compete with — we define what "strong" looks like for this program.
4. **Deterministic TypeScript pipeline from OpenAPI specs** (the "both tracks" story) — nobody has published the combined-track pattern with a written division of labor.
5. **Concrete MCP/OpenAPI feedback** — prior demos give none; structured feedback is explicitly rewarded and doubles as a relationship-builder with the Geoapify team.

---

## Appendix — all URLs cited

- https://www.geoapify.com/open-geospatial-program/ (program page: requirements, rewards, templates)
- https://www.Geoapify.com/news-and-updates/ (Batch #1 announcement, 14 May 2026)
- https://www.geoapify.com/mcp/ (official MCP server: 11 tools, endpoints, example prompts)
- https://github.com/burningion/geoapify-mcp (closest existing Geoapify MCP demo, 4 stars)
- https://skywork.ai/skypage/en/geoapify-mcp-server-developer-dive/1981519390313734144 (third-party deep-dive on the demo above)
- https://composio.dev/toolkits/geoapify (Composio Geoapify MCP toolkit + framework guides)
- https://dev.to/justrouting/build-a-delivery-ai-agent-with-mcp-and-routing-apis-aa4 (agent tutorial format to beat)
- https://dev.to/geoapify-maps-api/google-places-api-alternatives-which-poi-api-should-you-use-in-2026-hd4 (Geoapify's dev.to channel)
- https://lobehub.com/ar/mcp/jagan-shanmugam-open-streetmap-mcp (OSM MCP server: scenarios, examples/, uvx install)
- https://enterprisedna.co/directories/mcp/matbel91765-gis-mcp-server/ (focused-scope geospatial MCP server)
- https://pypi.org/project/geocode-mcp/0.1.0/ ("verification visible" README pattern)
- https://github.com/github/github-mcp-server (33,771★ reference: one-click installs, toolsets, safety modes)
- https://github.com/modelcontextprotocol/servers (91,383★ reference: verbatim configs, catalogs, community)
- https://wiki.openstreetmap.org/wiki/Geoapify (Geoapify on OSM wiki; free non-commercial use; Commute Time Map niche-site precedent)
- https://dev.to/demovexa/how-to-demo-a-developer-tool-cli-or-api-on-video-1108 (demo video craft, 2026-10-17)
- https://ostechnix.com/create-animated-gifs-terminal-linux-asciinema/ (asciinema→GIF workflow)
- https://dev.to/brpaz/make-your-project-readme-file-stand-out-with-animated-gifs-svgs-4kpe (README GIF/SVG embeds)
- https://deepwiki.com/jasoncobra3/LLM_Red_Teaming/9.3-creating-demos-and-documentation (demo file org + platform matrix)
- https://www.scien.cx/2021/11/30/get-your-open-source-project-featured-on-github/ (GitHub Release Radar — legit visibility)
- https://devgrantsdaily.com/ (grant aggregator listing this program — legit visibility)
