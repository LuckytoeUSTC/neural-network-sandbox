(() => {
  "use strict";
  // Anchored spring relaxation is a display layout; it does not alter J or dynamics.
  function solveWorker() {
    onmessage = ({ data: { anchors, links } }) => {
      const n = anchors.length / 2, xy = new Float64Array(anchors), velocity = new Float64Array(2 * n);
      const strength = new Float64Array(n), force = new Float64Array(2 * n);
      for (let k = 0; k < links.length; k += 3) { strength[links[k]] += links[k + 2]; strength[links[k + 1]] += links[k + 2]; }
      const separation = Math.min(.09, .32 / Math.sqrt(n) + .012), repulsion = .005 / Math.max(12, n);
      const springs = new Float64Array(links.length / 3);
      for (let k = 0; k < links.length; k += 3) springs[k / 3] = .12 * links[k + 2] / Math.max(strength[links[k]], strength[links[k + 1]], 1e-12);
      for (let iteration = 0; iteration < 160; iteration++) {
        for (let i = 0; i < xy.length; i++) force[i] = .06 * (anchors[i] - xy[i]);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          let dx = xy[2 * i] - xy[2 * j], dy = xy[2 * i + 1] - xy[2 * j + 1];
          if (!dx && !dy) { dx = .0001 * (i % 2 ? 1 : -1); dy = .0001; }
          const r2 = dx * dx + dy * dy + .00001, distance = Math.sqrt(r2);
          const f = repulsion / r2 + Math.max(0, separation - distance) * .5 / distance;
          force[2 * i] += dx * f; force[2 * i + 1] += dy * f;
          force[2 * j] -= dx * f; force[2 * j + 1] -= dy * f;
        }
        for (let k = 0; k < links.length; k += 3) {
          const i = links[k], j = links[k + 1];
          if (i === j) continue;
          const dx = xy[2 * j] - xy[2 * i], dy = xy[2 * j + 1] - xy[2 * i + 1];
          const distance = Math.hypot(dx, dy) || .001;
          const f = springs[k / 3] * (distance - .06) / distance;
          force[2 * i] += dx * f; force[2 * i + 1] += dy * f;
          force[2 * j] -= dx * f; force[2 * j + 1] -= dy * f;
        }
        for (let i = 0; i < xy.length; i++) {
          velocity[i] = .65 * velocity[i] + Math.max(-.015, Math.min(.015, force[i]));
          xy[i] = Math.max(.045, Math.min(.955, xy[i] + velocity[i]));
        }
      }
      postMessage(xy, [xy.buffer]);
    };
  }
  function relax(network, anchors, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const url = URL.createObjectURL(new Blob([`(${solveWorker.toString()})();`], { type: "text/javascript" }));
      const worker = new Worker(url); URL.revokeObjectURL(url);
      const end = () => { worker.terminate(); signal.removeEventListener("abort", abort); };
      const abort = () => { end(); reject(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = event => { end(); reject(new Error(event.message || "Layout failed.")); };
      worker.onmessage = ({ data }) => { end(); resolve(Array.from({ length: network.order.length }, (_, i) => [data[2 * i], data[2 * i + 1]])); };
      const links = new Float64Array(network.edges.length * 3);
      network.edges.forEach((edge, k) => links.set([edge.from, edge.to, Math.abs(edge.value)], 3 * k));
      const coordinates = new Float64Array(anchors.flat());
      worker.postMessage({ anchors: coordinates, links }, [coordinates.buffer, links.buffer]);
    });
  }
  globalThis.NeuroLayout = { relax };
})();
