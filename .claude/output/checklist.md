# Checklist before next session

- [ ] **Listen to the noon synth** (`/code-editor/noon`, or `/add_track
      synth=noon` in a blank session). This is the main thing: three rounds
      of sound-design changes this session were all tuned against your
      descriptions plus offline-render measurements, never actual playback.
      Specifically listen for:
  - Does a short hit now actually read as a sharp click, not a buzz/drone?
  - Is the grit/bitcrush texture audible, or does it need to go further?
  - Does turning `cv` up/down (`/noon1 cv=0.8`, `/noon1 cv=0.1`) produce an
    obviously different feel (louder/denser/more unstable vs. quieter/
    sparser/calmer)?
  - Does `link` cranked high (`/noon1 link=0.9`) do something interesting
    without just turning into a stuck drone? (It's designed to self-sustain
    a bit at extremes — bounded, not runaway — but worth confirming it reads
    as "cool" rather than "broken.")
- [ ] **Decide whether to commit.** Nothing from this session is committed
      yet: the `noon` synth, the `cv` modulator, the patch-resolution
      bugfix, the new synth `dispose()` lifecycle hook, and the demo
      route/session are all sitting in the working tree. If the noon sound
      design needs another round first, it's probably worth holding the
      commit until after that.
- [ ] **If noon needs another pass**, it'll be faster to react to specific
      notes ("channel 3 is too boomy," "clicks feel too short now," "grit is
      good but too loud") than to re-describe the whole target sound again.
- [ ] `.claude/context/known_bugs.md` is still empty — add anything you find
      while listening.
