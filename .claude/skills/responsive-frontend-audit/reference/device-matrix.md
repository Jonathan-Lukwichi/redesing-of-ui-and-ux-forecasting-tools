# Device verification matrix

Viewports to check (portrait unless stated):

| Device class          | Size      |
|-----------------------|-----------|
| Small Android         | 360x640   |
| iPhone SE             | 375x667   |
| iPhone 15/16 Pro      | 393x852   |
| Large Android         | 412x915   |
| Tablet portrait       | 768x1024  |
| Tablet landscape      | 1024x768  |
| Laptop                | 1280x800  |
| Wide desktop          | 1920x1080 |

Per-viewport checks. Mark each PASS / FAIL / UNVERIFIED, never blank:

| Check                          | Method                                    |
|--------------------------------|-------------------------------------------|
| No horizontal scroll           | scrollWidth <= clientWidth + 1             |
| All text legible (>= 11px)     | visual / computed style spot check         |
| Navigation usable              | menu opens, closes, traps focus            |
| Charts render                  | SVG present, no blank panels               |
| Console clean                  | no NaN/path/attribute errors, no pageerror |
| Touch targets >= 44x44         | computed size of interactive elements      |
| Safe-area respected (notched)  | fixed/floating UI clears home indicator    |
