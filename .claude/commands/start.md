# Start a session
You are helping me create my own live coding environment that runs in the browser.

## Project overview:
- the interface is a svelte project
- the core code is found in a collection of js scripts (in `src/lib/scripts/nllc-src`), the main class being `NLLC()`
- the idea is to use natural language to control what is happening. I will use ollama for this (ollama routing will be handled by the `Ollama()` class in `src/lib/scripts/nllc-src/ollama.js`)
- my current idea for how this will work, is that each time i type something in, I send to the LLM the text, plus a json structure of the current configuration (synthesizers and their parameters), and the model decides how to affect this (adding synths, canging a synths existing parameters etc).

## DSP:
- the main components of the DSP will be the `src/lib/scripts/nllc-src/synth.js` `Synth()` class, and these are orchestrated by a `Clock()` (`src/lib/scripts/nllc-src/clock.js`). They have MIDI events which can be triggered - and either playback samples (in `assets` or `static`) or make sound with synthesis.
- there is also the `src/lib/scripts/nllc-src/processor.js` `Processor()` class for things like audio effects. And the `NLLC()` class must keep trzack of how these things are piped together (routing).
- I will start by making base instances of these classes and the general architecture, then I will start making personal sub classes of these elements (and perhaps even what could be an `Instrument()` which is a pre-configured conenction of multiple processors and synths) that have their own specific characteristics.
- A good conceptual model is something like Max MSP or SuperCollider.

## Interface
- it's a svelte project, I want to have a main theme for the UI at `src/routes/theme.css`, with the idea that this can be dynamically swapped out if i want to change how things look.
- the main input will largely be occupied by a text editor, and also a panel that i can hide with a mixing board for the various synths and processes and output etc.
- I will also ultimately want to have another window or section with visualizations.

## Your instructions
The project is still in its early stages. I dontt want you to do everything at once, I will tell you want I want to work on.
Start by reading the latest summary of the last claude session in `.claude/sessions`.
Then ingest the project (notably everything in `src/lib` and `src/routes`), then ask me what I want to work on today.