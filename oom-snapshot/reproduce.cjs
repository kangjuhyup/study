const v8 = require('node:v8');
globalThis.oomLabRetained = [];
v8.writeHeapSnapshot('baseline.heapsnapshot');
class OomLabChunk { constructor(id) { this.id=id; this.payload=new Array(65536).fill(id); } }
setInterval(() => {
  for(let i=0;i<4;i++) globalThis.oomLabRetained.push(new OomLabChunk(globalThis.oomLabRetained.length));
  console.log(JSON.stringify({chunks:globalThis.oomLabRetained.length,...process.memoryUsage()}));
}, 20);
