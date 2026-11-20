(() => {
  "use strict";
  const M = globalThis.NeuroModel;
  let committed = null;
  const clients = new Set();

  // Serialized with the model factory so file:// needs neither fetch nor a server.
  function workerMain() {
    const model = globalThis.NeuroModel;
    let result = null, queuedAnalysis = null, analysisTimer = null, recording = null, recordingKey = null;
    const failure = (id, error) => postMessage({ id, error: { name: error.name, message: error.message, field: error.field } });
    function analyze() {
      analysisTimer = null;
      const { id, ids, options, recordingConfig, action } = queuedAnalysis;
      queuedAnalysis = null;
      try {
        if (!result) throw new Error("Run an experiment first.");
        const key = model.recordingKey(recordingConfig || result.config);
        if (recordingKey !== key) { recording = model.record(result, recordingConfig || result.config); recordingKey = key; result.recording = recording; }
        postMessage({ id, value: action === "record" ? recording : model.measure(result, ids, { ...options, recording }) });
      } catch (error) { failure(id, error); }
    }
    onmessage = ({ data }) => {
      const { id, action } = data;
      try {
        if (action === "simulate") {
          recording = null; recordingKey = null;
          let last = -Infinity;
          result = model.simulate(data.source, fraction => {
            const now = performance.now();
            if (now - last >= 100) {
              postMessage({ id, progress: fraction });
              last = now;
            }
          });
          recording = model.record(result);
          recordingKey = model.recordingKey(result.config);
          result.recording = recording;
          // Keep a copy for later analysis. The UI receives its own typed arrays.
          postMessage({ id, value: result });
        } else if (action === "measure" || action === "record") {
          if (queuedAnalysis) failure(queuedAnalysis.id, new DOMException("Analysis superseded", "AbortError"));
          queuedAnalysis = data;
          if (analysisTimer === null) analysisTimer = setTimeout(analyze, 0);
        } else throw new Error("Unknown computation request.");
      } catch (error) { failure(id, error); }
    };
  }

  class Client {
    constructor() {
      this.pending = new Map();
      this.sequence = 0;
      this.closed = false;
      const url = URL.createObjectURL(new Blob([M.workerSource(), `\n(${workerMain.toString()})();`], { type: "text/javascript" }));
      try { this.worker = new Worker(url); }
      finally { URL.revokeObjectURL(url); }
      clients.add(this);
      this.worker.onmessage = ({ data }) => {
        const job = this.pending.get(data.id);
        if (!job) return;
        if (data.progress !== undefined) { job.progress?.(data.progress); return; }
        this.pending.delete(data.id);
        job.cleanup();
        if (data.error) {
          const error = Object.assign(new Error(data.error.message), data.error);
          job.reject(error);
        } else job.resolve(data.value);
      };
      this.worker.onerror = event => {
        event.preventDefault();
        this.dispose(new Error(`Background computation interrupted: ${event.message || "Run the experiment again."}`));
      };
      this.worker.onmessageerror = () => this.dispose(new Error("Unable to read the background computation result. Run the experiment again."));
    }
    call(payload, signal, progress) {
      return new Promise((resolve, reject) => {
        if (this.closed) { reject(new Error("The background worker has closed. Run the experiment again.")); return; }
        if (signal?.aborted) { reject(signal.reason); return; }
        const id = ++this.sequence;
        const abort = () => {
          this.pending.delete(id);
          cleanup();
          reject(signal.reason);
        };
        const cleanup = () => signal?.removeEventListener("abort", abort);
        this.pending.set(id, { resolve, reject, progress, cleanup });
        signal?.addEventListener("abort", abort, { once: true });
        try { this.worker.postMessage({ ...payload, id }); }
        catch (error) { this.pending.delete(id); cleanup(); reject(error); }
      });
    }
    dispose(error = new DOMException("Calculation cancelled", "AbortError")) {
      if (this.closed) return;
      this.closed = true;
      this.worker.terminate();
      clients.delete(this);
      for (const job of this.pending.values()) { job.cleanup(); job.reject(error); }
      this.pending.clear();
    }
  }

  async function simulateAsync(source, signal, progress) {
    signal.throwIfAborted();
    if (!globalThis.Worker) throw new Error("This browser does not support background computation. Open this file in Chrome or Edge.");
    const client = new Client();
    const abort = () => client.dispose(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    try {
      const result = await client.call({ action: "simulate", source }, signal, progress);
      signal.throwIfAborted();
      committed?.client.dispose();
      committed = { client, result };
      return result;
    } catch (error) { client.dispose(error); throw error; }
    finally { signal.removeEventListener("abort", abort); }
  }

  function measureAsync(result, ids, options, signal) {
    if (!committed || committed.result !== result) return Promise.reject(new Error("Run the experiment again before analyzing the results."));
    return committed.client.call({ action: "measure", ids, options, recordingConfig: result.config }, signal);
  }

  function recordAsync(result, config, signal) {
    if (!committed || committed.result !== result) return Promise.reject(new Error("Run the experiment before changing its readout."));
    return committed.client.call({ action: "record", recordingConfig: config }, signal);
  }

  // Termination also handles cancelled long solves immediately; the preceding
  // successful experiment stays available until its replacement succeeds.
  addEventListener("pagehide", () => {
    for (const client of clients) client.dispose();
    committed = null;
  });
  globalThis.NeuroCompute = { simulateAsync, measureAsync, recordAsync };
})();
