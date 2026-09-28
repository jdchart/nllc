# The context folder

Every `.md` file in this folder is concatenated into the LLM's **system
prompt**, on every question, in filename order. Edit a file, ask the next
question, it's in effect — no restart, no registration step anywhere in the
code.

This file is the exception: `README.md` is skipped, as is anything starting
with `_` (park a file by renaming it `_10-thing.md`) or `.`.

## The two halves of the prompt

| Half | Where it lives | Changes |
|---|---|---|
| **Static** | these files | only when you edit them |
| **Live session state** | generated per question | constantly |

The static half is what you control here. The live half is a compact text
rendering of the audio graph — every track, bus, processor, modulator, patch
and their current parameter values — built by
`src/lib/scripts/llm-context.js` and wrapped in a `<session-state>` block on
the user turn. You don't need to describe the current session in these files;
the model is already told it. Describe the *system*, not the session.

It's text rather than raw JSON on purpose: the same information at roughly 40%
of the tokens, because JSON spends most of its bytes on punctuation and
repeated keys.

## Watching the cost

    /llm --context

prints every file, its size, its approximate token count, the size of the live
session block, and the per-question total. These files are a fixed cost on
every single question, so keep them tight — favour tables and one-liners over
prose, and delete anything the model demonstrably doesn't need.

`/llm --bare <question>` skips the session block for a question that doesn't
need it (the static files are still sent).

## Ordering

Filename order, which is why the files are numbered. Ordering matters a little
for models that cache on a stable prefix: put the things you edit most at the
*end* so edits invalidate as little as possible.

Current layout:

| File | What belongs in it |
|---|---|
| `00-role.md` | who the assistant is, how it should answer |
| `10-ribbit.md` | the object model and command grammar |
| `20-types.md` | the synth / processor / modulator reference |
| `30-examples.md` | worked examples |
| `40-house-rules.md` | your own rules — the file to edit first |

Nothing enforces this split. Add `50-my-genre-notes.md` and it's injected too.

## Keeping `20-types.md` in sync

`20-types.md` restates the engine's type registry, which means it can go stale
— and it fails *silently*, as an assistant that confidently doesn't know a
synth exists.

Nothing checks it automatically, on purpose: the engine (`ribbit/`) is a
standalone package and has no business knowing this app has a context folder.
The coupling is handled at the workspace level instead —
`.claude/tasks/{synth,processor,modulator}_creation.md` each carry a step for
it, and `.claude/tasks/write_documentation.md` covers removals.

The authoritative sources, in order of preference:

| For | Read |
|---|---|
| the one-line description | the class's own `llm_summary` field in `ribbit/src/…` |
| params, options, ranges | `ribbit/docs/llm/catalog.md`, or `/<object> help` live |
| the registry itself | `SYNTH_TYPES` / `PROCESSOR_TYPES` / `MODULATOR_TYPES` in `ribbit/src/ribbit.js` |

`catalog.md` is the engine's full dev-facing reference; `20-types.md` is the
lean prompt version of the same facts. They're deliberately different lengths —
don't paste one into the other.

## Also readable in a browser

`static/` is served, so the model's own context is at
<http://localhost:5173/context/10-ribbit.md> and so on.
