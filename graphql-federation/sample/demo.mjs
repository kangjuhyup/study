import { startGraph, request } from './graph.mjs';
import { demoQuery, profileOnlyQuery, myInventoryQuery, inventoryCountQuery } from './schemas.mjs';

const graph = await startGraph();
try {
  for (const query of [profileOnlyQuery, myInventoryQuery, inventoryCountQuery, demoQuery]) {
    graph.trace.requests.length = 0;
    graph.trace.plans.length = 0;
    const response = await request(graph.url, query);
    if (response.errors) throw new Error(JSON.stringify(response.errors));
    console.log('\nCLIENT QUERY\n' + query);
    console.log('\nRESPONSE\n' + JSON.stringify(response, null, 2));
    console.log('\nQUERY PLAN\n' + graph.trace.plans.at(-1));
    console.log('\nSUBGRAPH REQUESTS\n' + JSON.stringify(graph.trace.requests, null, 2));
  }
} finally {
  await graph.stop();
}
