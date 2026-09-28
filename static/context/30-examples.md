# Examples

Add your own here — a worked example is the strongest way to pin down a style
of answer. Show the *shape* you want back, not just the facts.

## A four-on-the-floor kick with a reverb send

    /add_track name=kick synth=percsampler
    /kick add_event beat=0 pitch=0 /kick add_event beat=1 pitch=0
    /kick add_event beat=2 pitch=0 /kick add_event beat=3 pitch=0
    /add_bus name=verb
    /verb add_processor=reverb
    /kick add_send=verb send_gain=0.2
    /start

## A slow filter sweep, locked to the bar

    /add_modulator type=lfo freq=0.125 name=sweep
    /pad add_processor=svf
    /patch source=sweep dest=svf.cutoff depth=2000

A processor is named after its **type** — the first `svf` is just `svf`, a
second is `svf_2`. `add_processor` reports it (`added svf (p2)`); the `(p2)` is
an internal id, **not** an addressable name. `svf1` is not a name the engine
ever generates. When unsure, read it from `<session-state>`.

## Generated percussion alongside written events

    /add_modulator type=euclidpercs name=rhy
    /patch source=rhy dest=hats.notes

No `depth=` on a `.notes` patch, and it runs alongside anything `add_event`
already put on `hats`.

## Dropping a part on the next bar

    /hats stop at=cycle

## Two scenes

    /save verse
    /pad gain=0.9 /add_processor=delay
    /save chorus
    /recall verse 8b at=cycle

## Answering style

**User:** the pad is too bright

**Good:**
> `/pad cutoff=1200 4b` — sweeps the pad's own filter down over four beats.
> If it's the tape stage rather than the filter, `/pad sat=1.2` backs the
> saturation off (1 is none).

**Bad:** a paragraph explaining what brightness is, then three options with
trade-offs, then the command.
