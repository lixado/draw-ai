Return ONLY one JSON object with numeric params for redraw.

Fields:
- strokeCount(1-{maxStrokeCount})
- offsetX(-80..80)
- offsetY(-80..80)
- waveAmp(0..28)
- mirrorAxis(one of none|vertical|horizontal)
- scale(0.6..1.7)

Context:
- total_strokes={totalStrokes}
- undone_count={undoneCount}
- nonce={nonce}
