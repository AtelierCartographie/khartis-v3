# 19 — Security for Client-Side Applications

## Overview

Khartis v3 is a **100% client-side application** with DuckDB WASM. All data processing occurs in the browser, with no server-side operations or external API calls. This architecture fundamentally changes the security model compared to traditional web applications.

## Security Context

### Client-Side Architecture Implications

Since Khartis runs entirely in the browser:
- **No authentication required** - Users work with their own data locally
- **No server to protect** - All processing happens client-side
- **No data transmission** - Data never leaves the browser
- **User controls everything** - They can only affect their own session

### Real Security Needs vs Over-Engineering

Many traditional web security measures are unnecessary for client-side applications:

#### ❌ **Not Needed**
- **XSS Protection** - Users can only affect their own session
- **CSRF Tokens** - No server sessions to hijack
- **SQL Injection** - DuckDB runs locally in WASM
- **Rate Limiting** - No API to throttle
- **Authentication** - No user accounts
- **Authorization** - No access control needed

#### ✅ **Actually Needed**
- **File name sanitization** - For clean exports
- **Numeric validation** - Prevent NaN/Infinity crashes
- **CSV formula protection** - For Excel security
- **Text normalization** - For display consistency

## Implemented Protections

### 1. File Name Sanitization

Ensures exported files have valid names across all operating systems:

```typescript
// sanitize.utils.ts
export function sanitizeFileName(fileName: string): string {
  // Remove invalid characters: < > : " / \ | ? *
  let sanitized = fileName.replace(/[<>:"/\\|?*]/g, '_');

  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/, '');

  // Limit length
  return sanitized.substring(0, 255);
}
```

**Usage**: Project names, export file names

### 2. Numeric Input Validation

Prevents mathematical errors that could crash visualizations:

```typescript
export function sanitizeNumericInput(input: string | number): number {
  if (typeof input === 'number') {
    if (!isFinite(input) || isNaN(input)) {
      return 0;
    }
    return input;
  }

  const parsed = parseFloat(input);
  if (isNaN(parsed) || !isFinite(parsed)) {
    return 0;
  }

  return parsed;
}
```

**Usage**: Statistical calculations, map scales, dimensions

### 3. CSV Formula Injection Protection

Prevents formula execution when users export data to Excel/Calc:

```typescript
export function sanitizeCSVCell(value: string): string {
  const dangerousStarts = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousStarts.some(char => value.startsWith(char))) {
    // Prefix with single quote to treat as text
    return "'" + value;
  }

  return value;
}
```

**Usage**: Data export to CSV format

### 4. Text Input Normalization

Simple text cleaning for display consistency:

```typescript
export function sanitizeTextInput(input: string): string {
  // Normalize whitespace and limit length
  return input.replace(/\s+/g, ' ').trim().substring(0, 500);
}
```

**Usage**: Legend text, annotations, titles

## Implementation in Components

### Project Name Component

```typescript
// project-name.svelte
import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';

$effect(() => {
  if (localProjectName !== createProjectState.newProject.projectName) {
    const sanitized = sanitizeProjectName(localProjectName);
    createProjectActions.setProjectName(sanitized);
  }
});
```

### Legend Component

```typescript
// legend.svelte
function updateItemField(id: string, field: keyof LegendItem, value: string): void {
  const sanitizedValue = sanitizeTextInput(value);
  legendActions.updateLegendItem(id, { [field]: sanitizedValue });
}
```

## Privacy and Data Security

### Local Storage Only

- **IndexedDB** for project persistence
- **No cookies** except for preferences
- **No tracking** without explicit consent
- **No external requests** for data processing

### Data Export Security

When exporting data:
1. File names are sanitized for OS compatibility
2. CSV cells are protected against formula injection
3. Metadata is stripped from exports (if applicable)

## Development Guidelines

### When to Add Security Measures

✅ **Add protection when**:
- Exporting data to external formats
- Preventing application crashes
- Ensuring cross-platform compatibility

❌ **Don't add protection for**:
- Hypothetical server attacks
- Multi-user scenarios
- Data the user controls

### Testing Security Features

```typescript
// Test file name sanitization
describe('sanitizeFileName', () => {
  it('removes invalid characters', () => {
    expect(sanitizeFileName('file<>name.csv')).toBe('file__name.csv');
  });

  it('handles path traversal attempts', () => {
    expect(sanitizeFileName('../../../etc/passwd')).toBe('etcpasswd');
  });
});

// Test CSV protection
describe('sanitizeCSVCell', () => {
  it('prevents formula injection', () => {
    expect(sanitizeCSVCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });
});
```

## Best Practices

### 1. Keep It Simple
Don't add security measures that don't apply to client-side apps.

### 2. Focus on User Experience
Security should prevent bugs, not restrict functionality.

### 3. Document Intent
Explain why each security measure exists:

```typescript
// Good: Clear purpose
// Prevents NaN from breaking D3 scales
const safeValue = sanitizeNumericInput(userInput);

// Bad: Vague reasoning
// Security check
const value = validate(input);
```

### 4. Avoid Security Theater
Don't implement measures that look secure but add no real value:

```typescript
// Bad: Pointless in client-side context
const sanitized = input
  .replace(/<script>/g, '')  // User can only affect themselves
  .replace(/SELECT.*FROM/g, '') // No SQL server
  .replace(/../../g, '');      // No file system access

// Good: Practical protection
const sanitized = input
  .replace(/[<>:"/\\|?*]/g, '_'); // Valid file names
```

## Performance Considerations

Security measures should be lightweight:

- **File sanitization**: O(n) string operations
- **Numeric validation**: Simple number checks
- **CSV protection**: Single character check
- **Text normalization**: Basic regex replace

No heavy operations like:
- Cryptographic hashing (unnecessary)
- Complex regex patterns (slow)
- Deep object traversal (expensive)

## Future Considerations

### If Server Features Are Added

Should Khartis add server-side features, implement:
1. **Authentication** - User accounts
2. **Authorization** - Access control
3. **Rate limiting** - API protection
4. **Input validation** - Server-side checks
5. **HTTPS only** - Encrypted transmission

### Current Limitations

The client-side approach means:
- No protection against local malware
- No audit trail for compliance
- No centralized security updates
- User responsible for their data

## Summary

Khartis v3's security model is **pragmatic and context-appropriate**:

- ✅ Protects against real issues (crashes, export problems)
- ✅ Keeps code simple and maintainable
- ✅ Focuses on user experience
- ❌ Avoids unnecessary security theater
- ❌ Doesn't implement server-side patterns

The key principle: **"Security measures should solve real problems, not hypothetical ones."**