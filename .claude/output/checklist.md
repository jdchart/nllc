# Checklist before next session

- [ ] **Still nothing committed, two sessions deep.** `git status`/`git diff`
      now shows 18 modified files spanning last session's console/mixer UI
      work (help text, history, click-to-paste, ghost-text suggestions) and
      this session's bug fixes (`channel.js`, `commands.js`,
      `MixerChannel.svelte`, `Mixer.svelte`, `synths/sampler.js`) plus doc
      updates. Worth committing as a few focused commits rather than one big
      one before anything else piles on top.
- [ ] Try the mixer fader/pan by hand: `npm run dev -- --open`, open
      `/code-editor`, drag a track's gain fader and pan dial. This was
      refactored to go through `channel.params.gain`/`.pan` instead of a
      separate taper import — verified by `svelte-check` and code inspection
      (the math is identical, just re-sourced) but not by an actual
      drag-interaction test.
- [ ] Click the new × remove button on a track/bus strip in the mixer (not
      just via console `remove_self`) — confirmed working via a scripted
      Playwright click, worth a manual look too since it's a new UI
      affordance.
- [ ] If you use patches (`/patch source=... dest=...`) in real sessions,
      note that a real bug in that path was just fixed: patching a
      processor's output used to get silently and permanently broken the
      moment *any* processor was added/removed/bypassed on the same channel.
      If you've hit weird "patch stopped working" or "can't unpatch" behavior
      in the past, that was almost certainly this — should be gone now.
- [ ] `.claude/context/known_bugs.md` is still empty — add anything you find
      while trying the above, or from real use since the last review.
- [ ] Two smaller findings were surfaced but intentionally left unfixed (not
      asked for this session): send-routing doesn't detect a longer cycle
      (bus A → bus B → bus A), and `NLLCProcessor.connect()` is dead/unused
      code. Low priority, flagging in case you want them picked up later.
- [ ] Optional follow-up, carried over from before: give `NLLCReverb.wet`,
      `NLLCDelay`'s params, and `NLLCLFO.freq` real `min`/`max` bounds — still
      shows no range in `/reverb help` etc.
- [ ] `notes-for-me.md` still has a long list of its own TODOs (save/restore
      state, session-to-JSON, modulator-generated events, dotted-path syntax
      like `/track_1.gain=0.5`, showing modulation on gain/pan in the UI) —
      none touched this session, worth a look if you're picking the next task.
