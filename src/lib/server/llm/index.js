// The provider registry — the seam that lets one console command talk to a
// local model or to a hosted one without the client knowing the difference.
//
// A provider is a module exporting:
//   id            short slug, used as the prefix of a qualified model id
//   label         what the homepage dropdown calls the group
//   listModels()  -> [{ id, label, detail }], or throws with a usable reason
//   chat(req)     -> async generator of { type: "delta" | "reasoning" | "done" }
//
// `chat` receives { model, system, prompt, history, format, conversationId,
// signal }. A provider honours what it can and ignores the rest: Ollama
// resends `history` every turn, Claude carries `conversationId` instead
// because its CLI owns the transcript. Both accept `format` (a JSON schema)
// so structured output is available before anything needs it — see the
// commentary in each file.

import * as ollama from "./ollama.js";
import * as claude from "./claude.js";

const PROVIDERS = [ollama, claude];

const byId = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export function getProvider(providerId) {
    return byId.get(providerId) ?? null;
};

// A qualified id is "<provider>:<model>". Split on the *first* colon only —
// Ollama's own names carry one ("qwen3.6:27b"), so a greedy split would
// mangle every local model.
export function parseModelId(qualified) {
    if (typeof qualified !== "string") return null;
    const colon = qualified.indexOf(":");
    if (colon <= 0) return null;

    const providerId = qualified.slice(0, colon);
    const model = qualified.slice(colon + 1);
    if (!model || !byId.has(providerId)) return null;
    return { providerId, model };
};

// Every provider's models, each group carrying its own error rather than one
// failure hiding the rest: Ollama being down should not empty the dropdown of
// Claude models, and vice versa. Probed in parallel — each provider's listing
// is a network call or a process spawn.
export async function listAllModels() {
    return Promise.all(PROVIDERS.map(async (provider) => {
        try {
            const models = await provider.listModels();
            return {
                provider: provider.id,
                label: provider.label,
                models: models.map((model) => ({ ...model, id: `${provider.id}:${model.id}` })),
                error: null,
            };
        } catch (error) {
            return { provider: provider.id, label: provider.label, models: [], error: error.message };
        }
    }));
};
