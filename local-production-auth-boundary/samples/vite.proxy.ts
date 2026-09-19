// Optional: merge into an existing Vite server.proxy config.
export const apiProxy = {
  '/api/profile': { target: 'http://127.0.0.1:18080', changeOrigin: true },
};
