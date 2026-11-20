# Personal memory

A minimal personal-memory loop for DeepSeek Harness: durable memories that
survive across sessions, managed by the model through three tools and recalled
automatically when a new session starts.

## What it does

- **Storage domain** — memories live in the `personal_memory` domain (table
  `memories`) on the profile's configured storage backend (`json` by default:
  one human-readable file, atomically rewritten). Every record is validated
  against a zod schema: `id`, `content`, `kind`
  (`preference` / `fact` / `event` / `note`), `tags`, `createdAt`, `updatedAt`,
  and the optional `sourceSessionId` that wrote it.
- **`memory_write`** — saves one self-contained memory. Writing content
  identical to an existing record refreshes that record, updating only the
  fields you pass (omitted kind/tags are preserved), instead of duplicating
  it. Tags are normalized to lowercase.
- **`memory_search`** — case-insensitive substring search over content and
  tags, optional kind filter, newest first, with a total match count. Omit the
  query to list recent memories.
- **`memory_forget`** — deletes one memory by id.
- **Automatic recall** — when a new agent is created, the plugin injects a
  bounded `<personal-memory>` block of the most recent memories via
  `agent.inject()`. The injection is logged (`agent/inbox/spliced`), so
  replay, fork, and resume reconstruct exactly what the model saw. A
  log-derived projection skips the injection when the session's history
  already contains a recall block (resumed sessions, or forked agents seeded
  with a parent prefix that carries one). Known edge: compaction runs in place
  on the same agent and may prune the block without re-injection; use
  `memory_search` after compaction if needed.
- **Prompt guidance** — one system-prompt section tells the model when to save
  and consult memories, and not to store secrets.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `autoRecall` | `true` | Inject recent memories at session start |
| `recallMaxItems` | `20` | Maximum records considered for recall |
| `recallMaxBytes` | `8192` | Byte budget of the injected recall block |

## Limitations (v1)

- Substring search only; no embeddings or semantic retrieval.
- No automatic capture from conversations; the model writes memories
  explicitly.
- No management UI; inspect or edit the storage file directly, or use the
  tools.
- Recall is global (not per-workspace) and also reaches subagents.
- Storage changes are visible in-process only (a storage-domain limitation).

## Data location

The `json` backend stores the domain under the profile's storage directory as
a single JSON document for the `personal_memory` unit. Delete that file to
reset all memories.