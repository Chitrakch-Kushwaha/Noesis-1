# Offline content drafting (adult developers only)

A separate package for drafting **wording variations** of existing, human-authored NOESIS templates.
It is never imported by the app (`npm run check:no-ai-sdk` fails if `app/` or `src/` imports it), it has
no dependencies, and it processes no student data.

```bash
# offline, no key: exercise the tool with labelled fixture output
npm --prefix tools/content-drafting run draft -- --template lom.circular-dynamics.e.what-provides --count 3 --fixture

# live (your own shell only; never the app's environment, never pasted into chat)
export GEMINI_API_KEY=...        # or OPENAI_API_KEY with --provider openai
export GEMINI_DRAFT_MODEL=...    # or OPENAI_DRAFT_MODEL; a model you have checked
npm --prefix tools/content-drafting run verify -- --confirm
npm --prefix tools/content-drafting run draft -- --template <id> --count 5

npm --prefix tools/content-drafting run check   # automated checks on every file in content/drafts/
npm --prefix tools/content-drafting test        # the tool's own tests (offline)
```

## What a draft is

`content/drafts/<template>.<time>.draft.json` with `origin: "ai-draft"`, `status: "draft"`, the provider,
model and prompt hash. Each variation has only `intro`, `stem`, `hints` and `distractorIdeas`.

The checks reject a draft that:

- is marked anything other than `draft`, or carries approval fields;
- adds fields such as an answer, parameters or a solver (answers always come from the app's code solvers);
- changes the template's `{{placeholders}}` or introduces numbers that are not in the original stem;
- has the wrong number of hints, states an answer, or contains links or markup.

## From draft to students (always by a person)

Passing `check` only means a draft may be **read** by a reviewer. Nothing here edits
`content/templates/`, the student manifest or mastery rules. A reviewer who likes a variation writes it
into a template file as `status: "draft"` with `provenance.origin: "ai-draft"`, then runs
`npm run content:validate` and `npm run content:review` as for any template (docs/05). Only a named
reviewer's approval, with a matching content hash, lets a question count toward mastery.

Before using a live provider, check its terms for your use: drafting here is an adult, offline task
(docs/10 §6).
