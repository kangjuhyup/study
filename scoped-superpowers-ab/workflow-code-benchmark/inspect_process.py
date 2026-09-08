#!/usr/bin/env python3
"""Derive process observations from command/file-change evidence, not model claims."""
import json,pathlib,re,sys
root=pathlib.Path(sys.argv[1]);out=[]
for p in sorted(root.glob('run-*.json')):
 d=json.loads(p.read_text());commands=[e for e in d['events'] if e['type']=='command_execution']
 reads=[]
 for e in commands:
  command=e['command'] or ''
  if e['exit_code']==0 and any(k in command for k in ['sed ','cat ','read_text','head ']):
   reads.extend(re.findall(r'workflows/full/skills/([\w-]+)/SKILL\.md',command))
   if 'workflows/scoped/SKILL.md' in command:reads.append('scoped-router')
 tests=[e for e in commands if 'python3 -m unittest' in e['command'] and ('Ran ' in e['output'] or 'FAILED' in e['output'])]
 production=[e['event_index'] for e in d['events'] if e['type']=='file_change' and any(c['path'].endswith('/tags.py') for c in (e.get('changes') or []))]
 red=[e['event_index'] for e in tests if e['exit_code']!=0 and 'FAILED' in e['output']]
 green=[e['event_index'] for e in tests if re.search(r'^OK$',e['output'],re.MULTILINE)]
 row={'run':d['run'],'arm':d['arm'],'skills_read':sorted(set(reads)),'document_files':[f for f in d['changed_files'] if f.startswith('docs/')],'commands':len(commands),'command_failures':sum(e['exit_code']!=0 for e in commands),'test_runs':len(tests),'red_before_production':bool(red and production and min(red)<min(production)),'green_after_production':bool(green and production and max(green)>max(production)),'git_repository_failures':sum('not a git repository' in e['output'].lower() for e in commands),'correct':d['correct']}
 out.append(row)
(root/'process.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
