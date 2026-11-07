#!/usr/bin/env python3
"""Check Wortlaut's pinned Architecture base, derivation and Markdown links."""

from __future__ import annotations

import argparse
from pathlib import Path
import runpy
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[2], help="Repository root."
    )
    parser.add_argument("--check", action="store_true", help="Validate only (the default).")
    args = parser.parse_args()
    root = args.root.resolve()
    checker = root / ".agents/skills/architect/scripts/check_inheritance.py"
    if not checker.is_file():
        print(
            "Missing Architecture base. Restore the pinned dependency from skills-lock.json "
            "through the Skills CLI.",
            file=sys.stderr,
        )
        return 1

    foundation = runpy.run_path(str(checker))
    errors = foundation["validate"](root, "wortlaut-architect")
    errors.extend(foundation["validate_links"](root / ".agents/skills/wortlaut-architect"))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("wortlaut-architect: pinned base, inheritance and all Markdown references match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
