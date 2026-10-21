# examples/<playbook>/ — per-playbook visual report output

Each **sample run** of a playbook lands here as a directory:

```
examples/site-selection/thaodien-coffee/
  report.html      # interactive Leaflet visual report (src/report/map.ts)
  report-hero.png  # 1200×630 static export for README/tutorial (src/report/static.ts)
  report.md        # Markdown report with [T#] citations (src/report/render.ts)
```

**Status: PENDING — no sample runs exist yet** (blocked on the Geoapify API key;
see `research/track1-geopify-deepdive.md` §6). Nothing here is fabricated:
directories appear only after real runs.

Playbooks and their sample questions:

| Playbook | Status | Sample questions |
|----------|--------|------------------|
| `site-selection` | MUST-SHIP (flagship) | `thaodien-coffee` (HCMC), `tayho-coworking` (Hanoi), `mykhe-pharmacy` (Da Nang) |
| `meetup-planning` | MUST-SHIP | `hcmc-meetup`, `hanoi-meetup` |
| `coverage-analysis` | STRETCH | `danang-coverage` |
| `neighborhood-profile` | STRETCH | `tayho-profile` |
| `tourism-dayplan` | STRETCH | `danang-dayplan` |

The visual report is the headline demo asset: every run produces the interactive map
(candidate zones, catchment polygons, competitor/complementary POI markers, ranked shortlist)
plus the static hero image. See ARCHITECTURE.md §4.
