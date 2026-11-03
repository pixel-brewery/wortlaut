# Review

Walk this after the checker is clean. It catches what no script sees, and it needs the screen open in a browser. Fix what you find instead of listing it, and report what you could not check.

## Foundations

- Does every screen use the same provider, theme and mode handling?
- Are both modes checked, not only assumed? A value that works in light can vanish in dark.
- Does every override still have its reason?

## Components

- Does the checker's count match the impression on screen? Look for controls it cannot see, such as a styled `span` that acts as a badge.
- Is any plain surface left that could be a real `Card`? If one has to stay, does it name the component the product should use?
- Is there one solid primary action per view, and is it the most likely next step?

## Orientation

- Can the user tell where they are? The active navigation item, the title and the selected row must all show it.
- Can every screen be reached by clicking from the start, without knowing the file name?
- Does each screen state what it is for in one line, and is the next step obvious?

## Interaction

- Does every control do something, or is it visibly disabled? A control that looks live and does nothing is a defect, even in a prototype.
- Does a selected row, tab or item look selected, also without the mouse on it?
- Do hover and selection cover the whole row, not one cell?
- Does an edit show its unsaved state, with a way to save and to revert?
- Are destructive and writing actions clearly marked, and does a dry run or preview say what will happen?
- Is the keyboard path intact, with labels on icon-only buttons?

## States

Show each that can occur, using `EmptyState`, `ErrorState`, `SuccessState` and `BusyState`:

- Empty, before there is any data
- Loading, for anything that takes time
- Failure, with the way out
- Success, with what changed

## Content

- Do numbers agree across screens? A count on an overview must match the list behind it.
- Are real sample data and invented sample data kept apart, and does the report say which is which?
- Are labels aligned, sentence case and free of jargon?
- Does long text wrap or truncate instead of breaking the layout?
- Do headings form a real hierarchy?

## Layout

- Does the page hold at the widths it claims to support, without horizontal page scroll?
- Are fields of the same row aligned on one baseline?
- Does the spacing follow `--mosaik-layout-space` rather than ad hoc values?
- Do tall controls waste room where a compact one fits, such as a long radio list versus a `Select`?
