#!/usr/bin/env python3
"""Normalize actual Codex usage keys, preserving each original usage object."""
import json,pathlib,sys
KEYS=['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']
for path in sorted(pathlib.Path(sys.argv[1]).glob('run-*.json')):
    row=json.loads(path.read_text());usage=row['usage_events']
    row['tokens']={k:sum(u[k] for u in usage) if usage and all(k in u and isinstance(u[k],(int,float)) for u in usage) else 'unavailable' for k in KEYS}
    command_text='\n'.join(c['command'] or '' for c in row['commands'])
    files=['workflow/SKILL.md','workflow/references/routing.md','workflow/references/superpowers/verification-before-completion.md']
    row['workflow_read_evidence']={f:any(f in (c['command'] or '') and c['exit_code']==0 for c in row['commands']) for f in files}
    row['treatment_compliant']=(not any(row['workflow_read_evidence'].values()) if row['arm']=='A' else all(row['workflow_read_evidence'].values()))
    path.write_text(json.dumps(row,indent=2)+'\n')
