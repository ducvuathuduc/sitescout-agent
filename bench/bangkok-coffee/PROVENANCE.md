# Bangkok coffee calibration dataset — provenance

How this dataset was (and will be) collected — spec §2.4.

## Collection method

Real entries come from the founder, from three sources only:

1. **Public listings** — shop names, addresses, and opening/closing
   dates visible in public listings and maps.
2. **Owner conversations** — the operator's own account of when the
   shop opened or closed and how busy it is, given in conversation
   with the founder.
3. **On-foot observation** — the founder (or someone he sends) standing
   on the street, seeing the shop open or shuttered, busy or empty.

No other source feeds this dataset. In particular: no scraping, no
bought data, no inferred entries.

## No invented tiers

A `traffic_tier` is recorded only from an observed source
(`tier_source` names it on every entry). A tier is never guessed from
a map pin, a photo, or a neighbouring shop. When the tier is not
known, the entry says `unknown` — the bench excludes unknown tiers
from the rank correlation rather than treating a guess as data.

## Confidentiality

Operator data is confidential by default (spec §3.4). Nothing
operator-identifying goes in the public repo without the operator's
written consent. The entry schema has no operator-name or contact
fields (`id, label, lat, lon, area, status, opened_approx,
closed_approx, traffic_tier, tier_source, observed_at`), so a row
cannot carry an operator's name, phone, or email by accident. The
public repo carries the schema and the aggregate bench metrics; rows
that would identify an operator stay out unless that operator consents
in writing.

The 5 entries on file are EXAMPLE entries with illustrative labels —
no real operator is named in them.
