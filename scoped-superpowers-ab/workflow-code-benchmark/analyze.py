#!/usr/bin/env python3
import json,pathlib,statistics,sys
r=pathlib.Path(sys.argv[1]);rows=[json.loads(p.read_text()) for p in sorted(r.glob('run-*.json'))]
keys=['wall_seconds','input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']
def value(row,key):return row['wall_seconds'] if key=='wall_seconds' else row['tokens'][key]
def describe(vals):
 return {'median':statistics.median(vals),'min':min(vals),'max':max(vals)} if vals and all(isinstance(v,(int,float)) for v in vals) else 'unavailable'
def delta(a,b):
 return {'absolute':b-a,'percent':(b-a)/a*100 if a else 'unavailable'} if isinstance(a,(int,float)) and isinstance(b,(int,float)) else 'unavailable'
report={'n':len(rows),'arms':{},'contrasts':{},'blocks':[]}
for arm in ['A','B','C']:
 selected=[x for x in rows if x['arm']==arm]
 report['arms'][arm]={'n':len(selected),'correct':sum(x['correct'] for x in selected),'exit_zero':sum(x['exit_code']==0 for x in selected),'metrics':{k:describe([value(x,k) for x in selected]) for k in keys},'document_files':[len([p for p in x['changed_files'] if p.startswith('docs/')]) for x in selected],'command_counts':[sum(e['type']=='command_execution' for e in x['events']) for x in selected]}
for a,b in [('A','B'),('A','C'),('B','C')]:
 report['contrasts'][f'{b}_minus_{a}']={}
 for k in keys:
  av=report['arms'][a]['metrics'][k];bv=report['arms'][b]['metrics'][k]
  report['contrasts'][f'{b}_minus_{a}'][k]=delta(av['median'],bv['median']) if isinstance(av,dict) and isinstance(bv,dict) else 'unavailable'
for block in sorted(set(x['block'] for x in rows)):
 group={x['arm']:x for x in rows if x['block']==block}
 report['blocks'].append({'block':block,'contrasts':{f'{b}_minus_{a}':{k:delta(value(group[a],k),value(group[b],k)) for k in keys} for a,b in [('A','B'),('A','C'),('B','C')] if a in group and b in group}})
(r/'analysis.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
