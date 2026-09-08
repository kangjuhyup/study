#!/usr/bin/env python3
import argparse,datetime,hashlib,json,os,pathlib,random,shutil,subprocess,tempfile,time
ROOT=pathlib.Path(__file__).resolve().parent
KEYS=['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']
def hashes(root):
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--seed',type=int,default=20260908);ap.add_argument('--timeout',type=int,default=600);args=ap.parse_args()
    out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=False)
    base=['A','B','C'];random.Random(args.seed).shuffle(base)
    order=[(block+1,base[(position+block)%3]) for block in range(3) for position in range(3)]
    env=os.environ.copy();env['PYTHONDONTWRITEBYTECODE']='1'
    cmd=['codex','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','workspace-write','-c','approval_policy="never"','--model','gpt-5.6-sol','-c','model_reasoning_effort="medium"','--json','--color','never','--output-schema',str(ROOT/'schema.json')]
    meta={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'model_requested':'gpt-5.6-sol','reasoning_requested':'medium','codex':subprocess.check_output(['codex','--version'],text=True).strip(),'python':subprocess.check_output(['python3','--version'],text=True).strip(),'order':order,'seed':args.seed,'command':cmd,'fixture_sha256':hashes(ROOT/'fixture'),'prompts_sha256':hashes(ROOT/'prompts'),'arms_sha256':hashes(ROOT/'arms'),'grader_sha256':hashlib.sha256((ROOT/'grade.py').read_bytes()).hexdigest()}
    (out/'protocol.json').write_text(json.dumps(meta,indent=2)+'\n')
    with tempfile.TemporaryDirectory(prefix='study-workflow-code-') as td:
        work=pathlib.Path(td)/'workspace'
        for i,(block,arm) in enumerate(order,1):
            if work.exists():shutil.rmtree(work)
            shutil.copytree(ROOT/'fixture',work,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
            agents=work/'AGENTS.md';agents.write_text(agents.read_text()+'\n'+(ROOT/'arms'/f'{arm}.md').read_text())
            initial=hashes(work)
            start=time.perf_counter();timedout=False
            try:
                run=subprocess.run(cmd+['-C',str(work),'-'],input=(ROOT/'prompts'/f'{arm}.txt').read_text(),text=True,capture_output=True,env=env,timeout=args.timeout)
                raw,err,exitcode=run.stdout,run.stderr,run.returncode
            except subprocess.TimeoutExpired as e:
                timedout=True;raw=e.stdout or '';err=e.stderr or '';exitcode=None
                if isinstance(raw,bytes):raw=raw.decode(errors='replace')
                if isinstance(err,bytes):err=err.decode(errors='replace')
            wall=time.perf_counter()-start;events=[]
            for line in raw.splitlines():
                try:events.append(json.loads(line))
                except json.JSONDecodeError:pass
            usage=[e['usage'] for e in events if e.get('type')=='turn.completed' and 'usage' in e]
            compact=[];answer=None;errors=[]
            for n,e in enumerate(events):
                item=e.get('item',{})
                if e.get('type')=='item.completed':
                    kind=item.get('type')
                    if kind=='command_execution':compact.append({'event_index':n,'type':kind,'command':item.get('command'),'exit_code':item.get('exit_code'),'output':item.get('aggregated_output','')[:5000]})
                    elif kind=='file_change':compact.append({'event_index':n,'type':kind,'changes':item.get('changes'),'status':item.get('status')})
                    elif kind=='agent_message':
                        try:answer=json.loads(item.get('text',''))
                        except json.JSONDecodeError:pass
                if e.get('type') in ['error','turn.failed']:errors.append(e)
            current=hashes(work);changed=sorted(p for p,h in current.items() if initial.get(p)!=h);deleted=sorted(set(initial)-set(current))
            protected=['AGENTS.md','contract.md']+[p for p in initial if p.startswith('workflows/')]
            protected_ok=all(current.get(p)==initial[p] for p in protected)
            scope_ok=not deleted and all(p=='tags.py' or p.startswith(('tests/','docs/')) for p in changed)
            artifacts=out/f'artifacts-{i:02d}-{arm}';artifacts.mkdir()
            for name in changed:
                dest=artifacts/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(work/name,dest)
            try:
                grader=subprocess.run(['python3','-I','-B',str(ROOT/'grade.py'),str(work/'tags.py')],text=True,capture_output=True,env=env,timeout=15)
                grading=json.loads(grader.stdout.strip().splitlines()[-1]);grading['exit_code']=grader.returncode
            except Exception as e:grading={'passed':False,'error':type(e).__name__}
            row={'run':i,'block':block,'arm':arm,'wall_seconds':wall,'exit_code':exitcode,'timed_out':timedout,'turn_completed':bool(usage),'tokens':{k:sum(u[k] for u in usage) if usage and all(k in u for u in usage) else 'unavailable' for k in KEYS},'usage_events':usage,'answer':answer,'grading':grading,'correct':grading['passed'] and protected_ok and scope_ok,'protected_unchanged':protected_ok,'scope_ok':scope_ok,'changed_files':changed,'initial_hashes':initial,'artifact_hashes':hashes(artifacts),'events':compact,'errors':errors,'stderr_line_count':len(err.splitlines())}
            (out/f'run-{i:02d}-{arm}.json').write_text(json.dumps(row,indent=2)+'\n')
            print(json.dumps({k:row[k] for k in ['run','arm','wall_seconds','exit_code','tokens','correct','changed_files','errors']}),flush=True)
            if exitcode!=0 or timedout:print('Stopped on infrastructure failure; attempt retained.',flush=True);break
if __name__=='__main__':main()
