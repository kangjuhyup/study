#!/usr/bin/env python3
"""Verify evidence integrity and the independent oracle without model calls."""
import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parent
campaign=pathlib.Path(sys.argv[1]);protocol=json.loads((campaign/'protocol.json').read_text())
for folder,key in [('fixture','fixture_sha256'),('prompts','prompt_sha256')]:
    actual={str(p.relative_to(root/folder)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/folder).rglob('*')) if p.is_file()}
    assert actual==protocol[key],folder+' changed since measurement'
unique={}
for e in json.loads((root/'fixture/events.json').read_text()):unique.setdefault(e['event_id'],e)
totals={a:sum((1 if e['kind']=='charge' else -1)*e['amount_cents'] for e in unique.values() if e['account']==a and e['status']=='settled' and '2026-09-01'<=e['date']<'2026-09-08') for a in ['alpha','beta','gamma']}
assert totals==protocol['expected']['totals']
assert sum(totals.values())==protocol['expected']['overall']
rows=[json.loads(p.read_text()) for p in sorted(campaign.glob('run-*.json'))]
assert len(rows)==len(protocol['order'])
for row,(pair,arm) in zip(rows,protocol['order']):
    assert (row['pair'],row['arm'])==(pair,arm)
    assert row['fixture_unchanged']
    for key,value in row['tokens'].items():
        raw=row['usage_events']
        expected=sum(u[key] for u in raw) if raw and all(key in u for u in raw) else 'unavailable'
        assert value==expected,(row['run'],key)
print(json.dumps({'runs':len(rows),'fixture_and_prompts_unchanged':True,'independent_oracle':totals,'correct':sum(r['correct'] for r in rows),'treatment_compliant':sum(r['treatment_compliant'] for r in rows)},indent=2))
