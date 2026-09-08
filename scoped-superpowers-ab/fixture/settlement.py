import json

def settle(events):
    totals = dict.fromkeys(['alpha', 'beta', 'gamma'], 0)
    seen = set()
    for event in events:
        if event['event_id'] in seen:
            continue
        if event['status'] != 'settled':
            continue
        if not ('2026-09-01' <= event['date'] <= '2026-09-08'):
            continue
        seen.add(event['event_id'])
        totals[event['account']] += event['amount_cents']
    return totals

if __name__ == '__main__':
    with open('events.json') as f:
        print(json.dumps(settle(json.load(f)), sort_keys=True))
