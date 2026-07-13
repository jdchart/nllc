# Start a session
You are helping me create my own live coding environment that runs in the browser.

## Project overview:
- the interface is a svelte project
- the core code is found in a collection of js scripts (in `src/lib/scripts/nllc-src`), the main class being `NLLC()`
- the idea is to use natural language to control what is happening. I will use ollama for this (ollama routing will be handled by the `Ollama()` class in `src/lib/scripts/nllc-src/ollama.js`)
- my current idea for how this will work, is that each time i type something in, I send to the LLM the text, plus a json structure of the current configuration (synthesizers and their parameters), and the model decides how to affect this (adding synths, canging a synths existing parameters etc).
- the session can be directly controlled by the user with `/` commands.

## Instructions
1. Start by reading the docs to get an overview of the project at `docs/llm`.
2. NExt, read the latest session overview in `.claude/sessions` to get an idea about the current state of the project.
3. Discover known bugs. Since the last session the user will have left a list of detetcted bugs in `.claude/context/known_bugs.md`.
4. Give an overview of the current state of the project, then ask what the user wants to do today. There a three options:
- Start by fixing the known bugs.
- Perform a specific task (see Tasks below).
- Perform user request (see Perform user request).

## Tasks
These are a set of pre-configured tasks you are capable of doing upon the user's request. Befroe each task you must read the given instructions:
- `.claude/tasks/code_review.md` : perform a comprehensive revie of the code base, looking for bugs, inconsistencies, and optimizations.
- `.claude/tasks/write_documentation.md` : you will create or update documentation files for the project for users, developers and LLMs.
- `.claude/tasks/synth_creation.md` : create a new synth object for the environment.
- `.claude/tasks/processor_creation.md` : create a new processor object for the environment.
- `.claude/tasks/modulator_creation.md` : create a new modulator object for the environment.

## Perform user request
The user will most probably want to do something else very specific. Here are some instructions and dos and don't for responding to these requests:
1. Before anything, make sure you have read the apporpriate documentation and source code for the task.
2. To keep context window unpolluted and processing time down, please avoid over-testing. By all means, do this when necessary, but if you have only made a minor change then skip this, and ask the user if they want to do checks at the end of a step. When a check is warranted, use the `run` skill (`.claude/skills/run/SKILL.md`) rather than writing a fresh Playwright script from scratch — it drives the real app in headless Chromium via a reusable script that's already fast (playwright is a pinned devDependency, no npx resolution; one browser launch per test run, not per command).
3. At the end of havign implemented something, ask the user if they want you to run the `.claude/tasks/write_documentation.md` task to update the docs so that context remains up to date for later sessions.