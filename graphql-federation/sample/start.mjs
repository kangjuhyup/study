import { startGraph } from './graph.mjs';

const graph = await startGraph({ ports: [4001, 4002, 4003, 4000] });
console.log(`Gateway: ${graph.url}`);
for (const service of graph.services) console.log(`${service.name}: ${service.url}`);
console.log('Ctrl+C로 종료합니다.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await graph.stop();
  });
}
