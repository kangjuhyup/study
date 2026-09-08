#!/usr/bin/env python3
"""Aggregate only measured JSON fields. Never infer unexposed token counts."""
import json, pathlib, statistics, sys
root=pathlib.Path(sys.argv[1]);rows=[json.loads(p.read_text()) for p in sorted(root.glob('run-*.json'))]
keys=['wall_seconds','input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']
def value(row,key):return row[key] if key=='wall_seconds' else row['tokens'][key]
report={'runs':len(rows),'arms':{},'difference_B_minus_A':{}}
for arm in ['A','B']:
 selected=[r for r in rows if r['arm']==arm]
 report['arms'][arm]={'n':len(selected),'correct':sum(r['correct'] for r in selected),'exit_zero':sum(r['exit_code']==0 for r in selected),'metrics':{}}
 for key in keys:
  vals=[value(r,key) for r in selected]
  report['arms'][arm]['metrics'][key]=({'median':statistics.median(vals),'min':min(vals),'max':max(vals)} if vals and all(isinstance(v,(float,int)) for v in vals) else 'unavailable')
for key in keys:
 a=report['arms']['A']['metrics'][key];b=report['arms']['B']['metrics'][key]
 report['difference_B_minus_A'][key]=({'absolute':b['median']-a['median'],'percent':(b['median']-a['median'])/a['median']*100 if a['median'] else 'unavailable'} if isinstance(a,dict) and isinstance(b,dict) else 'unavailable')
report['paired_differences']=[]
for pair in sorted(set(r['pair'] for r in rows)):
 group={r['arm']:r for r in rows if r['pair']==pair}
 if len(group)!=2:continue
 differences={}
 for key in keys:
  a=value(group['A'],key);b=value(group['B'],key)
  differences[key]={'absolute':b-a,'percent':(b-a)/a*100 if a else 'unavailable'} if isinstance(a,(int,float)) and isinstance(b,(int,float)) else 'unavailable'
 report['paired_differences'].append({'pair':pair,'differences':differences})
(root/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
