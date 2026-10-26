# Learn module content audit

Resolves the "define scope" blocker in `coven#361`. Maps epic `coven#256`'s proposed IA, priority order, and legal-risk tiers into a concrete per-category article list for the 7 categories that currently render the "Articles for this category are coming soon." placeholder in `src/app/(public)/learn/[slug]/page.tsx`. `park-riding-safety` is excluded — it already has content, shipped via the later, separately-scoped epic `coven#269`, and was never part of #256's original 7-category IA.

Authors: follow `docs/learn-content-guidelines.md` for tone, per-topic risk rules, and the required per-article disclaimer.

Implementation pattern to replicate per category (already shipped for `park-riding-safety`): a `{category}-data.ts` typed article array + a `{category}-sections.tsx` renderer built on the shared `LearnSection`/`LearnDisclaimer` components (`src/app/(public)/learn/learn-section.tsx`), registered via two-line additions to the `CATEGORY_CONTENT`/`CATEGORY_NAV` maps in `src/app/(public)/learn/[slug]/page.tsx`. See `src/app/(public)/learn/park-riding-safety/park-riding-safety-data.ts` and `park-riding-safety-sections.tsx` for the reference implementation.

Risk tiers (per `docs/learn-content-guidelines.md`): 🟢 low-risk. 🟡 needs care — explain the concept, defer specifics/settings/diagnoses to a qualified professional, and end with an appropriate disclaimer.

This is a working backlog, not a final content list — adjust as categories are implemented.

## Getting Started (`getting-started`)

1. 🟢 First Day Guide: What to Expect at the Mountain — orientation to arrival, tickets/passes, the lessons desk, base area logistics. _(#256 priority topic: "First Day Guide")_
2. 🟢 What to Pack for Your First Day — clothing layers, essentials, what the resort typically provides vs. what to bring yourself. _(#256 priority topic: "What to Pack")_
3. 🟡 Skiing 101: The Absolute Basics — what skiing involves at a concept level; defers technique instruction to a lesson. _(#256 priority topic: "Beginner Ski/Snowboard Guides")_
4. 🟡 Snowboarding 101: The Absolute Basics — same framing, snowboard-specific. _(#256 priority topic: "Beginner Ski/Snowboard Guides")_
5. 🟢 Booking a Lesson vs. Going It Alone — decision factors to weigh, not a recommendation either way. _(extrapolated)_

## Gear & Sizing (`gear-and-sizing`)

1. 🟢 Gear 101: What You Actually Need for Your First Day. _(#256 priority topic: "Gear 101")_
2. 🟢 Buying vs. Renting: How to Decide. _(#256 priority topic: "Buying vs. Renting")_
3. 🟢 Skis vs. Snowboard: Choosing Your Sport. _(extrapolated)_
4. 🟡 Understanding Binding DIN Settings — explains the concept and what it depends on, defers the actual number to a certified technician (reference pattern: `src/app/(public)/gears/sizing/ski-sizing-sections.tsx`). _(extrapolated; explicitly named as the reference example in the content guidelines)_
5. 🟡 Helmets & Protective Gear Basics — safety-adjacent, informational only. _(extrapolated)_
6. 🟢 Used & Secondhand Gear: What to Check For. _(extrapolated)_

## Mountain Basics (`mountain-basics`)

1. 🟢 Trail Ratings Explained: Green, Blue, Black & Beyond. _(#256 priority topic: "Trail Ratings & Mountain Basics")_
2. 🟢 Reading a Trail Map. _(#256 IA)_
3. 🟢 Lift Types & How to Ride Them. _(extrapolated)_
4. 🟡 Terrain Types: Groomed, Moguls, Trees & Backcountry Basics — touches on conditions/risk, informational framing only. _(extrapolated)_
5. 🟢 Mountain Signage & Closures: What They Mean. _(extrapolated)_

## Snow Sports on a Budget (`budget`)

1. 🟡 What Skiing/Snowboarding Actually Costs — all figures labeled as estimates. _(#256 priority topic: "Cost of Skiing/Snowboarding")_
2. 🟡 Budget Guide: Getting on the Mountain for Less. _(#256 priority topic: "Budget Guide")_
3. 🟡 Discount Passes, Deals & Off-Peak Timing — pricing-adjacent, estimates only. _(extrapolated)_
4. 🟢 Renting vs. Buying on a Budget — budget-first framing, cross-links the Gear & Sizing article. _(extrapolated)_
5. 🟢 Finding Used Gear Without Overpaying. _(extrapolated)_

## Mountain & Lift Etiquette (`etiquette`)

1. 🟢 Mountain & Lift Etiquette Basics. _(#256 priority topic: "Mountain Etiquette")_
2. 🟢 Lift Line Etiquette. _(extrapolated)_
3. 🟢 Sharing the Trail: Right-of-Way Basics. _(extrapolated)_
4. 🟢 Uphill/Downhill Traffic & the Responsibility Code — links out to the published responsibility code, same pattern as the shipped park-riding-safety etiquette article. _(extrapolated)_

## Gear Care (`gear-care`)

1. 🟢 Gear Care 101: Between-Trip Basics. _(#256 IA)_
2. 🟢 Waxing & Base Care Explained. _(#256 IA)_
3. 🟡 Edge Tuning: What It Is and When to See a Shop — explains the concept, defers the actual tune to a shop (same deferral pattern as binding DIN). _(#256 IA)_
4. 🟢 Off-Season Storage Basics. _(#256 IA)_
5. 🟢 Knowing When Gear Needs Replacing. _(extrapolated)_

## Community & Inclusion (`community-and-inclusion`)

1. 🟢 Finding Your Place in the Snow Sports Community. _(#256 IA)_
2. 🟢 Beginner Buddy Guide: Riding with a Mentor. _(#256 IA)_
3. 🟢 Riding with Mixed Skill Levels in Your Group. _(#256 IA)_
4. 🟢 Overcoming First-Timer Intimidation. _(extrapolated)_
