#!/usr/bin/env python3
"""Preserve legacy calls while the shared Designer owns the checker."""

from pathlib import Path
import runpy
import sys

checker = Path(__file__).resolve().parents[4] / '.agents/skills/designer/scripts/check_design.py'
if not checker.is_file():
    raise SystemExit('The pinned shared Designer is missing; install it through the project Skills CLI workflow.')
sys.argv[0] = str(checker)
runpy.run_path(str(checker), run_name='__main__')
