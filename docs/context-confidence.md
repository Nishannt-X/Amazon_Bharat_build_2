# Context confidence scoring

The old scoring combined keyword bonuses (up to ten points), a 74-point context ceiling and a contradiction rule that capped the result at 25. Free-text Bedrock scoring was then applied separately. This could sharply reduce the displayed score when a body estimate disagreed with photo geometry or when a citizen described still water after the photo model marked movement.

The new policy, `llm-bounded-v1`, uses one ledger for all answers, including multiple-choice, typed and transcribed replies:

1. Start with the original photo evidence score, or the existing underpass demonstration starting score for that explicitly configured demo.
2. Give Bedrock the original photo metrics, previous answers, current context and newest answer.
3. Require an integer confidenceDelta and a concise confidenceReason. Clamp each newest-answer delta to −2 through +3 percentage points.
4. Add that delta once to the previous context score, bounded to 0–100. Missing or invalid cloud assessments produce a zero adjustment.
5. Store question index, applied delta, reason, provider and before/after scores with the analysis JSON.

The server does not add keyword bonuses or replace the original CV score. A contradiction remains visible in evidence metadata but does not trigger a separate score cap. Four answers can change the starting score by at most −8 or +12 points, subject to the 0–100 bounds. The LLM may return zero; not every answer earns points.

Photo confidence remains separate from the combined context score. This is an evidence index, not a calibrated probability of model accuracy or a certificate that a crossing is safe. Context alone does not promote publication; contradictory evidence remains pending review independently of the numeric score.

For existing answers scored with the old policy, open the context panel's **Details & previous answers** and select **Re-evaluate answers**. The backend replays those original answers from the immutable photo snapshot, obtains fresh bounded assessments and saves the updated ledger. It does not migrate storage or change the underlying photo snapshot.

Verification: four live Nova assessments produced 78 → 78 → 79 → 80 → 80 for a synthetic underpass example; all four assessments were from Bedrock and preserved photo score 49. Focused context tests cover per-answer bounds, retry protection, cloud failure, all answer types, original photo preservation and legacy rescoring. Photo-analysis tests cover the retained geometry and safety checks.
