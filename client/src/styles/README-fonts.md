# Font System Documentation

This directory contains the centralized font configuration for the AdScript Studio application, ensuring consistent typography across all modes and environments.

## Files Overview

### `fonts.css`
Main font configuration file that defines:
- CSS custom properties (variables) for consistent font usage
- Global font application rules
- Print styles for downloaded documents

### `fonts-env.css`
Environment-specific font optimizations:
- Development: Enhanced font rendering
- Production: Optimized for larger screens
- Mobile: Responsive font sizing
- Print: Print-optimized fonts

### `fonts-server.css`
Server-side font configuration for generated HTML documents (downloads, exports)

## Font Stacks

### Primary Font (UI Text)
```css
-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
sans-serif
```

### Monospace Font (Code/Technical)
```css
'Consolas', 'Monaco', 'Courier New', monospace
```

## Usage

### CSS Variables
```css
font-family: var(--font-primary);     /* For UI text */
font-family: var(--font-mono);        /* For code/technical content */
font-size: var(--font-size-base);     /* 16px */
font-weight: var(--font-weight-normal); /* 400 */
```

### Environment Consistency
- **Development**: Enhanced font smoothing for better readability
- **Production**: Optimized font sizes for different screen sizes
- **Mobile**: Responsive font scaling
- **Print**: Print-optimized font rendering

## Implementation

The font system is automatically loaded through `index.css` which imports `fonts.css`. This ensures all components inherit consistent typography without manual configuration.

## Maintenance

When adding new components or modifying existing ones:
1. Use CSS variables instead of hardcoded font values
2. Follow the established font stacks
3. Test across all environments (dev, staging, production)
4. Verify print styles for downloadable documents
