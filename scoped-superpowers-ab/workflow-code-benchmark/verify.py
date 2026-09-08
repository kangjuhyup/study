#!/usr/bin/env python3
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parent;campaign=pathlib.Path(sys.argv[1]);meta=json.loads((campaign/'protocol.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def hashes(p):return {str(f.relative_to(p)):sha(f) for f in sorted(p.rglob('*')) if f.is_file() and '__pycache__' not in f.parts}
assert hashes(root/'fixture')==meta['fixture_sha256']
assert hashes(root/'prompts')==meta['prompts_sha256']
assert hashes(root/'arms')==meta['arms_sha256']
assert sha(root/'grade.py')==meta['grader_sha256']
assert len(set((root/'prompts'/f'{arm}.txt').read_bytes() for arm in 'ABC'))==1
rows=[json.loads(p.read_text()) for p in sorted(campaign.glob('run-*.json'))];assert len(rows)==9
for row,(block,arm) in zip(rows,meta['order']):
 assert (row['block'],row['arm'])==(block,arm)
 expected=dict(meta['fixture_sha256']);expected['AGENTS.md']=hashlib.sha256(((root/'fixture/AGENTS.md').read_text()+'\n'+(root/'arms'/f'{arm}.md').read_text()).encode()).hexdigest()
 assert row['initial_hashes']==expected
 assert row['protected_unchanged'] and row['scope_ok']
 artifacts=campaign/f'artifacts-{row["run"]:02d}-{arm}'
 assert hashes(artifacts)==row['artifact_hashes']
 for k,v in row['tokens'].items():
  usage=row['usage_events'];expected=sum(u[k] for u in usage) if usage and all(k in u for u in usage) else 'unavailable';assert v==expected
 # Rerun grading from the retained artifact; this is not a new model measurement.
 res=subprocess.run(['python3','-I','-B',str(root/'grade.py'),str(artifacts/'tags.py')],capture_output=True,text=True)
 grade=json.loads(res.stdout.strip().splitlines()[-1]);assert grade['passed']==row['grading']['passed']
print(json.dumps({'runs':len(rows),'correct':sum(r['correct'] for r in rows),'identical_user_prompt':True,'only_workflow_configuration_differs':True,'artifact_hashes_valid':True,'grading_reproduced':True},indent=2))
