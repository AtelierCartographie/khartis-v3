# Cross-Cutting

## Performance

| Aspect      | Current                             | Planned                             |
| ----------- | ----------------------------------- | ----------------------------------- |
| Load        | Code splitting; lazy heavy libs     | Bundle budget CI gate               |
| Compute     | Main thread (classification, joins) | Worker pool + transferable buffers  |
| DuckDB      | WASM in main thread                 | Dedicated worker                    |
| Interaction | Debounce + preview LOD              | Predictive precompute               |
| Rendering   | Attribute packing; minimal redraws  | GPU instancing refinements          |
| Caching     | Palette + basic breaks reuse        | Formal cache w/ invalidation hashes |

## Accessibility

Keyboard navigation, visible focus ring, contrast-aware palettes, non-color encodings (patterns), Escape closes transient UI, textual map summaries.

## Security & Privacy

Client-only; sanitize filenames & CSV cells; enforce size quotas; dependency auditing. Not applicable: CSRF, server auth, multi-tenant isolation.

## Internationalization

Paraglide compile-time messages (en, fr). Semantic keys, parameterization, no string concatenation.

## Error Surfacing

Inline contextual messages; fallback projection or classification when failure; export retry guidance.

## Monitoring (Future/Indicative)

Long task tracking, frame pacing sampling, bundle size CI gate, Lighthouse budget check.

## Future Enhancements (Top)

Adaptive classification refresh; locale number/date formatting; worker pools; encryption (optional) later; structured diagnostics toggle; automated validator i18n audit.

Quick reference: optimize critical path first, keep UI accessible, security pragmatic, translations type-safe, document any placeholder algorithms (e.g. Jenks fallback) until replaced.
