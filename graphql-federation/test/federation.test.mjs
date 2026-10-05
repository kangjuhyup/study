import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { composeServices } from '@apollo/composition';
import { parse } from 'graphql';
import { startGraph, request } from '../sample/graph.mjs';
import {
  demoQuery, productsSdl, inventorySdl, profileSdl,
  profileOnlyQuery, myInventoryQuery, inventoryCountQuery,
} from '../sample/schemas.mjs';

let graph;
before(async () => { graph = await startGraph(); });
after(async () => { await graph?.stop(); });
beforeEach(() => {
  graph.trace.requests.length = 0;
  graph.trace.plans.length = 0;
});

const profile = { displayName: '학습 사용자', email: 'learner@example.test' };

test('me with only profile does not call inventory or products', async () => {
  const response = await request(graph.url, profileOnlyQuery);
  assert.deepEqual(response, { data: { me: { profile } } });
  assert.deepEqual(graph.trace.requests.map(item => item.service), ['profile']);
});

test('me can traverse User inventory and its Product entities across three subgraphs', async () => {
  const response = await request(graph.url, myInventoryQuery);
  assert.deepEqual(response, { data: { me: {
    profile,
    inventory: { totalCount: 2, products: [
      { id: 'p1', name: '키보드', price: 80000 },
      { id: 'p2', name: '모니터', price: 250000 },
    ] },
  } } });
  assert.deepEqual(graph.trace.requests.map(item => item.service), ['profile', 'inventory', 'products']);
  const inventory = graph.trace.requests.find(item => item.service === 'inventory');
  assert.deepEqual(inventory.variables.representations.map(item => ({ ...item })), [
    { __typename: 'User', id: 'user-1' },
  ]);
  const products = graph.trace.requests.find(item => item.service === 'products');
  assert.deepEqual(products.variables.representations.map(item => ({ ...item })), [
    { __typename: 'Product', id: 'p1' },
    { __typename: 'Product', id: 'p2' },
  ]);
});

test('omitting products from inventory avoids the Products subgraph', async () => {
  const response = await request(graph.url, inventoryCountQuery);
  assert.deepEqual(response, { data: { me: { profile, inventory: { totalCount: 2 } } } });
  assert.deepEqual(graph.trace.requests.map(item => item.service), ['profile', 'inventory']);
});

test('products-only query does not call inventory', async () => {
  const response = await request(graph.url, '{ product(id: "p1") { name } }');
  assert.deepEqual(response, { data: { product: { name: '키보드' } } });
  assert.deepEqual(graph.trace.requests.map(item => item.service), ['products']);
});

test('gateway joins entities and passes unselected @requires inputs', async () => {
  const response = await request(graph.url, demoQuery);
  assert.deepEqual(response, { data: { products: [
    { id: 'p1', name: '키보드', inStock: true, shippingEstimate: 3000 },
    { id: 'p2', name: '모니터', inStock: false, shippingEstimate: 0 },
  ] } });
  assert.deepEqual(graph.trace.requests.map(item => item.service), ['products', 'inventory']);
  const inventory = graph.trace.requests.find(item => item.service === 'inventory');
  assert.deepEqual(inventory.variables.representations.map(item => ({ ...item })), [
    { __typename: 'Product', id: 'p1', price: 80000, weight: 800 },
    { __typename: 'Product', id: 'p2', price: 250000, weight: 5000 },
  ]);
  assert.match(graph.trace.plans.at(-1), /Sequence/);
  assert.match(graph.trace.plans.at(-1), /Flatten/);
});

test('reference resolver resolves known keys and returns null for missing entities', async () => {
  const products = graph.services.find(item => item.name === 'products');
  const response = await request(products.url,
    'query($refs: [_Any!]!) { _entities(representations: $refs) { ... on Product { id name } } }',
    { refs: [{ __typename: 'Product', id: 'p2' }, { __typename: 'Product', id: 'missing' }] });
  assert.deepEqual(response, { data: { _entities: [{ id: 'p2', name: '모니터' }, null] } });
});

test('an unknown product stays null without an inventory lookup', async () => {
  const response = await request(graph.url,
    '{ product(id: "missing") { name inStock shippingEstimate } }');
  assert.deepEqual(response, { data: { product: null } });
  assert.deepEqual(graph.trace.requests.map(item => item.service), ['products']);
});

test('composition rejects two non-shareable resolvers for the same field', () => {
  const brokenInventory = inventorySdl.replace('inStock: Boolean', 'name: String!\n    inStock: Boolean');
  const result = composeServices([
    { name: 'products', typeDefs: parse(productsSdl) },
    { name: 'inventory', typeDefs: parse(brokenInventory) },
    { name: 'profile', typeDefs: parse(profileSdl) },
  ]);
  assert(result.errors?.some(error => error.extensions.code === 'INVALID_FIELD_SHARING'));
});
