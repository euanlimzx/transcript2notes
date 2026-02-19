┌─────────────────────────────────────────────────────────────────────────┐
│ INPUT: raw transcript (timestamped lines, strict order) │
└─────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 1 (sequential): Parse + optional chunking for boundary detection │
│ → Output: same lines with (time, text); maybe 1–3 min windows │
└─────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 2 (sequential): Boundary detection (embeddings / LLM / rules) │
│ → Output: ordered list of segments [(t_start, t_end, text), ...] │
└─────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 3 (parallel over segments): Per-segment pipeline │
│ • Correction (context: prev/next segment + domain glossary) │
│ • Summarization / structuring (bullets, definitions) │
│ • Optional: segment title │
│ → Output: one structured note blob per segment (indexed by position) │
└─────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STAGE 4 (sequential): Assembly │
│ • Concatenate by segment order │
│ • Optional: generate global outline from segment titles/summaries │
│ → Output: hierarchical notes (sections → subsections → content) │
└─────────────────────────────────────────────────────────────────────────┘
