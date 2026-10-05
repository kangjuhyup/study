import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { composeServices } from '@apollo/composition';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';
import { serializeQueryPlan } from '@apollo/query-planner';
import { subgraphs } from './schemas.mjs';

export async function request(url, query, variables = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);
  return response.json();
}

// port=0은 OS가 빈 포트를 선택하도록 해 테스트 간 충돌을 피한다.
export async function startGraph({ ports = Array(subgraphs.length + 1).fill(0) } = {}) {
  const servers = [];
  const services = [];
  const trace = { requests: [], plans: [] };
  async function stop() {
    for (const server of [...servers].reverse()) await server.stop();
  }
  try {
    for (const [index, subgraph] of subgraphs.entries()) {
      const server = new ApolloServer({ schema: buildSubgraphSchema([subgraph]) });
      servers.push(server);
      const { url } = await startStandaloneServer(server, {
        listen: { host: '127.0.0.1', port: ports[index] },
      });
      services.push({ name: subgraph.name, typeDefs: subgraph.typeDefs, url });
    }

    const composition = composeServices(services);
    if (composition.errors) {
      throw new Error(composition.errors.map(error => error.message).join('\n'));
    }

    const gateway = new ApolloGateway({
      supergraphSdl: composition.supergraphSdl,
      buildService({ name, url }) {
        return new class extends RemoteGraphQLDataSource {
          willSendRequest({ request }) {
            trace.requests.push({ service: name, query: request.query, variables: request.variables });
          }
        }({ url });
      },
      experimental_didResolveQueryPlan({ queryPlan }) {
        trace.plans.push(serializeQueryPlan(queryPlan));
      },
    });
    const server = new ApolloServer({ gateway });
    servers.push(server);
    const { url } = await startStandaloneServer(server, {
      listen: { host: '127.0.0.1', port: ports.at(-1) },
    });
    return { url, services, trace, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
