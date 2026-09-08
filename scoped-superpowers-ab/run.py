#!/usr/bin/env python3
"""Serial, fresh-session, read-only A/B benchmark. No dependencies beyond stdlib."""
import argparse, hashlib, json, os, pathlib, random, shutil, subprocess, tempfile, time, datetime
ROOT = pathlib.Path(__file__).resolve().parent
EXPECTED = {'totals': {'alpha':875, 'beta':2050, 'gamma':800}, 'overall':3725,
            'defects':['DATE_RULE','DEDUP_RULE','REFUND_RULE']}

def hashes(root):
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file()}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--pairs',type=int,default=3);ap.add_argument('--seed',type=int,default=20260908)
    ap.add_argument('--model',default='gpt-5.6-sol');ap.add_argument('--reasoning',default='medium');ap.add_argument('--timeout',type=int,default=300)
    args=ap.parse_args();out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=False)
    rng=random.Random(args.seed);first=rng.choice(['A','B']);order=[]
    for pair in range(args.pairs):
        arm=first if pair%2==0 else ('B' if first=='A' else 'A')
        order.extend([(pair+1,arm),(pair+1,'B' if arm=='A' else 'A')])
    env=os.environ.copy();env['PYTHONDONTWRITEBYTECODE']='1'
    command=['codex','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--model',args.model,'-c','model_reasoning_effort="'+args.reasoning+'"','--json','--color','never','--output-schema',str(ROOT/'schema.json')]
    meta={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'python':subprocess.check_output(['python3','--version'],text=True).strip(),'codex':subprocess.check_output(['codex','--version'],text=True).strip(),'model_requested':args.model,'reasoning_requested':args.reasoning,'seed':args.seed,'order':order,'command':command,'fixture_sha256':hashes(ROOT/'fixture'),'prompt_sha256':hashes(ROOT/'prompts'),'expected':EXPECTED}
    (out/'protocol.json').write_text(json.dumps(meta,indent=2)+'\n')
    with tempfile.TemporaryDirectory(prefix='study-scoped-ab-') as td:
        work=pathlib.Path(td)/'workspace';shutil.copytree(ROOT/'fixture',work);initial=hashes(work)
        for i,(pair,arm) in enumerate(order,1):
            assert hashes(work)==initial,'Fixture changed'
            prompt=(ROOT/'prompts'/f'{arm}.txt').read_text()
            start=time.perf_counter();timed_out=False
            try:
                result=subprocess.run(command+['-C',str(work),'-'],input=prompt,text=True,capture_output=True,env=env,timeout=args.timeout)
                stdout,stderr,code=result.stdout,result.stderr,result.returncode
            except subprocess.TimeoutExpired as e:
                timed_out=True;stdout=e.stdout or '';stderr=e.stderr or '';code=None
                if isinstance(stdout,bytes):stdout=stdout.decode(errors='replace')
                if isinstance(stderr,bytes):stderr=stderr.decode(errors='replace')
            elapsed=time.perf_counter()-start
            events=[]
            for line in stdout.splitlines():
                try:events.append(json.loads(line))
                except json.JSONDecodeError:pass
            completed=[e for e in events if e.get('type')=='turn.completed']
            usage=[e.get('usage',{}) for e in completed]
            messages=[];commands=[];errors=[]
            for e in events:
                item=e.get('item',{})
                if e.get('type')=='item.completed' and item.get('type')=='agent_message':messages.append(item.get('text',''))
                if e.get('type')=='item.completed' and item.get('type')=='command_execution':commands.append({'command':item.get('command'),'exit_code':item.get('exit_code')})
                if e.get('type') in ['error','turn.failed']:errors.append(e)
            answer=None
            for message in reversed(messages):
                try:answer=json.loads(message);break
                except json.JSONDecodeError:pass
            normalized=dict(answer) if isinstance(answer,dict) else None
            if normalized and isinstance(normalized.get('defects'),list):normalized['defects']=sorted(normalized['defects'])
            metrics={k:sum(u[k] for u in usage) if usage and all(k in u and isinstance(u[k],(int,float)) for u in usage) else 'unavailable' for k in ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']}
            row={'run':i,'pair':pair,'arm':arm,'wall_seconds':elapsed,'exit_code':code,'timed_out':timed_out,'turn_completed':bool(completed),'usage_events':usage,'tokens':metrics,'answer':answer,'correct':normalized==EXPECTED,'fixture_unchanged':hashes(work)==initial,'commands':commands,'errors':errors,'stderr_line_count':len(stderr.splitlines()),'event_types':sorted(set(e.get('type','') for e in events))}
            (out/f'run-{i:02d}-{arm}.json').write_text(json.dumps(row,indent=2)+'\n')
            print(json.dumps({k:row[k] for k in ['run','arm','wall_seconds','exit_code','tokens','correct','errors']}),flush=True)
            # Keep full streams outside study: compact results above are the retained research data.
            pathlib.Path(td,f'{i}.jsonl').write_text(stdout)
            if code!=0 or timed_out:
                print('Stopping on infrastructure failure; failed attempt retained.',flush=True);break
if __name__=='__main__':main()
