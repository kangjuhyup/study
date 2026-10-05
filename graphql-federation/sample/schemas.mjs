import { parse } from 'graphql';

export const profileSdl = `
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type Query {
    me: User!
  }

  type User @key(fields: "id") {
    id: ID!
    profile: Profile!
  }

  type Profile {
    displayName: String!
    email: String!
  }
`;

export const productsSdl = `
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type Query {
    product(id: ID!): Product
    products: [Product!]!
  }

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    price: Int!
    weight: Int!
  }
`;

export const inventorySdl = `
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3",
          import: ["@key", "@external", "@requires"])

  type User @key(fields: "id") {
    id: ID!
    inventory: Inventory!
  }

  type Inventory {
    totalCount: Int!
    products: [Product!]!
  }

  type Product @key(fields: "id") {
    id: ID!
    price: Int! @external
    weight: Int! @external
    inStock: Boolean
    shippingEstimate: Int @requires(fields: "price weight")
  }
`;

// price와 shippingEstimate는 원, weight는 g 단위인 학습용 데이터다.
const products = [
  { id: 'p1', name: '키보드', price: 80000, weight: 800 },
  { id: 'p2', name: '모니터', price: 250000, weight: 5000 },
];
const stock = new Map([['p1', true], ['p2', false]]);
const user = {
  id: 'user-1',
  profile: { displayName: '학습 사용자', email: 'learner@example.test' },
};
const ownedProductIds = new Map([['user-1', ['p1', 'p2']]]);

export const subgraphs = [
  {
    name: 'products',
    typeDefs: parse(productsSdl),
    resolvers: {
      Query: {
        product: (_, { id }) => products.find(product => product.id === id) ?? null,
        products: () => products,
      },
      Product: {
        __resolveReference: ({ id }) => products.find(product => product.id === id) ?? null,
      },
    },
  },
  {
    name: 'inventory',
    typeDefs: parse(inventorySdl),
    resolvers: {
      User: {
        __resolveReference: reference => reference,
        inventory: ({ id }) => {
          const ids = ownedProductIds.get(id) ?? [];
          return { totalCount: ids.length, products: ids.map(id => ({ id })) };
        },
      },
      Product: {
        // @requires로 전달된 price/weight를 유지해야 한다.
        __resolveReference: reference => stock.has(reference.id)
          ? { ...reference, inStock: stock.get(reference.id) }
          : null,
        shippingEstimate: ({ price, weight }) => price >= 100000 ? 0 : Math.ceil(weight / 1000) * 3000,
      },
    },
  },
  {
    name: 'profile',
    typeDefs: parse(profileSdl),
    resolvers: {
      // 로그인 구현 대신 고정된 가상 사용자를 반환한다.
      Query: { me: () => user },
      User: { __resolveReference: ({ id }) => id === user.id ? user : null },
    },
  },
];

export const profileOnlyQuery = `query MyProfile {
  me {
    profile { displayName email }
  }
}`;

export const myInventoryQuery = `query MyInventory {
  me {
    profile { displayName email }
    inventory {
      totalCount
      products { id name price }
    }
  }
}`;

export const inventoryCountQuery = `query MyInventoryCount {
  me {
    profile { displayName email }
    inventory { totalCount }
  }
}`;

export const demoQuery = `query ProductPage {
  products {
    id
    name
    inStock
    shippingEstimate
  }
}`;
