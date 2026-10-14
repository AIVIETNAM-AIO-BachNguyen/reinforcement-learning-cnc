# Dub reference applied to the industrial DSS

14 October 2026. Branch: `frontend-redesign`.

## Reference review and selection

The three user-provided documents describe visual references, including reconstructed components and interpreted recommendations. Their embedded agent prompts and imperatives were treated as reference material. The user's desktop DSS requirements determine the implementation.

| Document | Direction | Fit for this application |
| --- | --- | --- |
| `DESIGN.md` | Steep: serif editorial analytics, peach accents, 24px cards and very large headlines | Attractive for a product presentation, but the large typography, spacing and soft shapes would reduce useful operational information in the first screen. |
| `DESIGN (1).md` | **Dub: white paper surfaces, fine structural borders, compact UI, neutral typography and restrained blue** | **Selected.** It explicitly includes dashboard tables, navigation, inputs and technical metadata. Its information density and flat surfaces support quick comparison and investigation. |
| `DESIGN (2).md` | Ventriloc: warm editorial data presentation, orange/brass accents and asymmetric shapes | Its data-first imagery is relevant, but the large section gaps, display typography and distinctive shapes would add emphasis unrelated to operational priority. |

This is one adapted Dub direction. Steep's serif/peach treatment and Ventriloc's orange/asymmetric treatment were not combined into it.

## Implementation decisions

- White workspace panels on a near-white canvas; light sidebar with a small blue active state. Structural borders use `#e5e5e5`. Primary and secondary text use `#171717` and `#525252`.
- Near-black primary actions, matching Dub's filled dark button component. The source also proposes sapphire primary fills elsewhere; the neutral version gives a consistent action hierarchy and reserves blue for links, selection and focus.
- Outer panels use 12px radii, controls 8px, inputs 6px and small status badges pill radii. Nested evidence values use dividers instead of repeated tinted cards. No decorative 3D machine drawings, gradients, texture or floating marketing elements.
- Page headings use 30px medium-weight sans serif. Paragraphs use 16px where explanatory; data, source notices and supporting labels use 13–14px. Native system sans serif and native monospace are the actual rendered families; licensed Satoshi and Inter font assets were not supplied or added.
- Numbers use monospace with tabular figures where they are compared. Numeric columns align right, text columns left and status columns center. Scenario comparisons and episode counts follow the same rules.
- Compact and Comfortable control table row padding and repeated evidence spacing. The preference persists locally across workspace pages; disabled browser storage falls back to a session preference.
- Table headers and the identity column remain sticky inside bounded scroll regions. Search, filter and sort controls are explicit and keyboard accessible. Experiment filtering/sorting is accurately labelled as applying to the loaded page, because the current API only provides pagination.
- Desktop spacing stays appropriate for an authenticated app. The reference's 1200px marketing container and 64px section gaps become a bounded 1840px workspace and 16–20px working gaps. No mobile-specific layout was added.
- The user's semantic status requirements take precedence over decorative color guidance: red denotes risk/failure, amber caution, green completion/approval. Text labels accompany color. Blues and tints are kept out of large content surfaces.

## Decision-oriented overview

The first screen leads with snapshot metrics and the priority maintenance case. The next layer contains health/load trends for the three machines with recorded samples. Axes, sample duration and comparison with the first sample provide context; the change in percentage points is derived only from those recorded values.

The attention table follows immediately and provides machine/case search, status filtering and sorting by machine or priority. Inspecting a row or a trend opens the matching evidence and moves keyboard focus to it. M07 has a case record but no health/load sample series; its detail explicitly reports that absence instead of substituting M03's samples. Operational fixture machine IDs are not presented as direct links into unrelated research recommendation IDs.

Machine evidence and the labelled dispatch replay now sit below the investigation table. The replay retains explicit play, step and reset controls. It does not claim maintenance has completed or fabricate an improvement in health.

The shared design applies to Decision Center, review dialogs, agents, scenario comparisons, experiment creation/results, episode evidence, user administration, sign-in and system states. Existing authentication, review confirmation, execution, cancellation and retry behavior remain intact.

## Boundaries and validation

The research and backend limitations documented in [dss-research.md](dss-research.md) still apply. Overview/agents are recorded demo data. What-if presets display recorded simulator outcomes; this redesign does not provide a new server-side parameterized simulation endpoint or invented slider calculations.

Validation includes the production build, TypeScript, lint, 54 tests and Chrome review at 1280, 1440, 1920, 2560 and 3840px. The browser uses mock product records and intercepted GET-only authentication/user fixtures. It does not submit production reviews, mutate accounts or operate machines. Browser checks cover density persistence, search, status filters, matching evidence, keyboard focus, column alignment, sticky table structure and sidebar collapse.

Taste Skill's inspector was used as an auxiliary browser check. Landing-page rules for photographs, oversized focal points, animation, boxed app panels and dense text are explicitly outside this application brief. Numeric monospace is required by the user and the chosen reference. The remaining mixed-font metric and caution-text contrast warnings are design judgments to review, not hidden failures or a claim of standards certification.

See [desktop-verification.json](desktop-verification.json), [desktop-interactions.json](desktop-interactions.json) and the updated [overview preview](previews/overview.jpg).
