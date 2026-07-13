# Checklist before next session

- [ ] **Commit the backlog — top priority.** It's now seven sessions deep
      (last real commit: `19460b9`). This session alone is several logical
      commits: (1) review bugfixes (name namespace/`RESERVED_NAMES`,
      master speakers guards, empty-value/typo errors, `randomnotes`
      restart via `onClockStart`, duplicate-`.notes` rejection, recall
      event deferral, mixer identity-diff, transport staleness, param
      bounds), (2) the options mechanism (base classes + all six
      synth/processor/modulator subclasses + `applyOptions` routing),
      (3) `/harmony` + event editing (`events`/`remove_event=`),
      (4) loop automation (console `automate=` family + `paramKey`
      serialization + recall reconcile + synth-type restore),
      (5) mixer UI (sends badges, note-flash dot, loop ring),
      (6) the docs pass. Next session can split and commit these if you
      don't want to do it by hand.
- [ ] **Listen to the loop-automation feel** (the sandbox can't render
      audio): `/add_track name=lead`, a couple of `add_event`s, `/start`,
      then `/lead automate=gain from=0.9 to=0.2 beat=2 duration=1` —
      confirm the dip repeats musically every loop, and that
      `automate=... once` (e.g. a fade-in) fires exactly once.
- [ ] **Hear a live `/harmony` change**: author a pattern with `degree=`
      (not `pitch=`), let it loop, then `/harmony root=57
      scale=0,2,3,5,7,8,10` mid-playback — the pattern should retune on the
      next notes without a glitch.
- [ ] **Hear the runtime options**: `/lead waveform=square` mid-playback
      (should change from the next note), `/lfo1 waveform=triangle` while
      patched (wobble shape changes in place), `/reverb duration=6` (brief
      tail discontinuity is expected/documented — judge whether it's
      acceptable to your ears).
- [ ] **Check `/stop` `/start` with a `randomnotes` patch running** — it
      should resume generating immediately after restart (this was the
      absolute-beat-cursor bug; fixed and logic-verified, but audible
      confirmation is worth 10 seconds).
- [ ] **Look at the three new mixer bits** and judge the visuals (sized by
      code, not by eye): the per-strip sends list under the inserts, the
      "notes" flash dot on a `randomnotes` tile while patched and playing,
      and the loop-progress ring around the Transport LED.
- [ ] **Save a session file and reload it twice in a row** — second load
      should refresh the mixer strips correctly (identity-diff fix), and
      automation/waveform/scale should all come back.
- [ ] Param bounds are an opinionated call — check you're happy with them:
      delay `feedback` capped at 0.95 (runaway guard), `wet` at 2, lfo
      `freq` at 20k. Trivial to change in the class constructors.
- [ ] Skim the updated docs (`commands.md`'s new "Params vs. options" and
      "Loop automation" sections, the rewritten "Names" section,
      `objects.md`'s option tables) before trusting them as future context.
- [ ] `Ollama()` is still an empty stub — with the command surface now
      solid and forgiving, and `snapshotSession()` producing the config
      JSON your plan sends to the model, next session is a good time to
      start it.
- [ ] Note anything that feels off during the above in
      `.claude/context/known_bugs.md` (currently empty).
