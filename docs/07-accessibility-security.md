# Accessibility and Security

## Accessibility

### Standards and principles

- Compliance with WCAG/RGAA principles: perceivable, operable, understandable, robust.
- Consistent focus management, visible focus rings, and logical tab order.
- Adequate color contrast; palette choices validated against contrast thresholds when possible.
- Alternative descriptions and summaries where full screen-reader equivalence is not possible for complex maps.

### Keyboard navigation and shortcuts

- Full keyboard navigation across main steps and panels.
- Common shortcuts for save, export, undo/redo, select, delete, and search.
- Escape closes dialogs and side panels; Enter confirms in editors and forms.
- Shortcut conflicts are avoided; the list is documented and accessible via help.
- See also: 08 — Keyboard shortcuts.

### Responsiveness and touch

- Responsive layouts adapt from mobile to desktop, maintaining target sizes and spacing for touch accessibility.
- Gestures complement but do not replace keyboard and pointer.

### Internationalization

- Interface available in French and English with runtime selection.
- Language preference is detected and can be changed; strings are fully translated.
- Directionality and locale formats (numbers, dates) are respected when applicable.

## Security

### Data protection

- Imported tabular and geospatial data remain strictly client-side and are not sent to servers.
- Local Storage and IndexedDB are used for autosave, versions, and preferences with cautious quotas.
- Users can clear local data in the application settings.

### Content Security Policy

- A restrictive CSP blocks unexpected scripts and cross-origin data execution.
- Only whitelisted domains are allowed for fonts, analytics, and map tiles when applicable.

### Privacy and analytics

- Optional audience measurement collects minimal, aggregated data.
- Consent is obtained where required; collection is clearly explained.
- No sensitive or user-imported data is transmitted via analytics.

### Dependencies and supply chain

- Dependencies are pinned and scanned for vulnerabilities.
- Regular updates and security patches are applied as part of maintenance.

### Incident response

- Clear procedures exist to report, triage, and fix security issues.
- Advisory communication is coordinated with hosting operators where appropriate.
