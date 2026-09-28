# The ribbit system

One `AudioContext`, one clock, one `master` bus. Everything else is created by
the user and shares **one flat name namespace** — a track, bus, processor,
modulator and group can never share a name, and none may be named after a
command.

| Object | What it is |
|---|---|
| **track** | a mixer channel + exactly **one** synth. The synth has no name of its own: the track's name is its surface, so `/lead waveform=square` sets the synth's option. |
| **bus** | a mixer channel with no synth. A destination for sends. |
| **master** | the fixed output channel. No synth. Refuses `solo` and `out=`. |
| **processor** | an insert on a channel (`add_processor=reverb`). Named after its **type** — the first `svf` is `svf`, a second is `svf_2`. The `(p2)` in "added svf (p2)" is an internal id, not an addressable name. |
| **modulator** | a control-signal source. Does nothing until patched. |
| **patch** | modulator → a parameter, with `depth`. Gets an id like `x1`. |
| **group** | a name standing for several names. Forwards every key it doesn't own to each member. |

Removing a track, processor or modulator cascade-removes any patch touching it.

## Command grammar

    /<name> key=value key=value ...

`<name>` is a top-level command, `master`, or any object's name. Several
commands can go on one submitted line: `/kick gain=0 8 /reverb wet=0.9 6b`.

| Form | Meaning |
|---|---|
| `/kick` | no args → one-line summary of that object |
| `/kick help` | full reference: every param, its range, every command it takes |
| `gain=0.5` | set instantly |
| `gain=0.5 3` | ramp over 3 **seconds** |
| `gain=0.5 4b` | ramp over 4 **beats** |
| `at=beat` / `at=cycle` | defer to the next beat / loop boundary. Works on **every** mutating command, not just ramps. |
| `cutoff=random` | draw uniformly from the param's range; `min=`/`max=` narrow it |
| `/kick random` | roll every param at once; `random=4b` ramps the whole roll |
| `cutoff.r=false` | exclude one param from a bare `random` (the only dotted key) |

Object creation is the one thing that refuses `at=`.

## Channel commands (tracks, buses, master)

`gain=` `pan=` `mute`/`unmute` `solo`/`unsolo` `remove_self`
`add_processor=<type>` `remove_processor=<name>`

Routing: `out=<name>` (replace all sends with one), `add_send=<name>`
[`send_gain=`], `send=<id>` [`send_gain=`], `remove_send=<id>`. A new
track/bus sends to `master` by default.

Tracks only (a bus/master reports "has no synth"): `start` `stop` `synth=<type>`
`add_event beat= pitch=|degree= velocity= duration=` `events`
`remove_event=<n>` `clear_events`, plus the synth's own params and options.

Automation (channels, processors, modulators) — loop-relative, replayed every
pass: `automate=<param> to= [from= beat= duration= curve= once]`,
`automations`, `remove_automation=<n>`, `clear_automation`.

## Top-level commands

| Command | Notes |
|---|---|
| `/start` `/stop` | the transport |
| `/clock bpm= num_beats=` | `bpm` ramps; `num_beats` does not |
| `/harmony root= scale=` | shared key. Retunes playing `degree=` patterns immediately |
| `/add_track name= synth= [out=]` | **`synth=`**, not `type=`. Defaults to `oscsynth` |
| `/add_bus name= [out=]` | |
| `/add_modulator type= name= ...` | **`type=`** here — the one command that uses it. Type-specific options go on the same line |
| `/patch source= dest= depth=` | `dest` is `<object>.<param>`; returns an id |
| `/patch id=x1 depth=` / `/unpatch id=x1` | adjust / remove |
| `/add_group name= members=a,b,c` | also `add_member=` `remove_member=` |
| `/tracks` `/buses` `/modulators` `/patches` `/groups` `/states` | list |
| `/save <name>` `/recall <name> [4b] [at=]` `/remove_state <name>` | scene snapshots; `/recall` ramps |
| `/save_session` `/load_session` | JSON file (aliases `/save_json` `/load_json`) |
| `/record` `/stop_record` `/save_record` `/clear_record` | a take; the first two accept `at=` |
| `/recording mode=stereo\|multitrack bits=32\|16 max_minutes=` | status + settings |
| `/help` | everything |

## Event patches (generated notes)

A modulator that generates **notes** rather than a control signal patches into
a track's synth via the reserved destination `<track>.notes`, with **no
`depth=`**:

    /patch source=rhy dest=kick.notes

It runs *alongside* whatever `add_event` already put on that track. A duplicate
`.notes` patch on the same pair is rejected. The generators are `randomnotes`,
`markovpercs`, `euclidpercs`, `patternvariator` and `chorale`; every other
modulator patches into a parameter instead. `randomgestures` is the exception
to both — it needs no patch at all.
