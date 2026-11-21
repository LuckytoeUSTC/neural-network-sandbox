(() => {
  "use strict";
  // GIF89a, fixed global palette, LZW compression. Encoding runs off the UI thread.
  function encoderWorker() {
    let chunks = [], width, height, palette, lookup;
    const bytes = values => new Uint8Array(values);
    const word = n => [n & 255, n >> 8];
    function compress(indices) {
      const out = []; let bits = 9, next = 258, dict = new Map(), pending = 0, count = 0;
      const emit = code => {
        pending |= code << count; count += bits;
        while (count >= 8) { out.push(pending & 255); pending >>>= 8; count -= 8; }
        if (next === (1 << bits) && bits < 12) bits++;
      };
      emit(256);
      let prefix = indices[0];
      for (let i = 1; i < indices.length; i++) {
        const value = indices[i], key = prefix * 256 + value, found = dict.get(key);
        if (found !== undefined) { prefix = found; continue; }
        emit(prefix);
        if (next < 4096) dict.set(key, next++);
        else { emit(256); dict = new Map(); next = 258; bits = 9; }
        prefix = value;
      }
      emit(prefix); emit(257);
      if (count) out.push(pending & 255);
      return bytes(out);
    }
    onmessage = ({ data }) => {
      try {
        if (data.type === "start") {
          ({ width, height, palette } = data); chunks = [];
          chunks.push(bytes([71,73,70,56,57,97,...word(width),...word(height),247,0,0,...palette]));
          lookup = new Uint8Array(32768);
          for (let code = 0; code < lookup.length; code++) {
            const r = ((code >> 10) & 31) * 255 / 31, g = ((code >> 5) & 31) * 255 / 31, b = (code & 31) * 255 / 31;
            let best = Infinity, index = 0;
            for (let i = 0; i < 256; i++) {
              const distance = (r - palette[3*i]) ** 2 + (g - palette[3*i+1]) ** 2 + (b - palette[3*i+2]) ** 2;
              if (distance < best) { best = distance; index = i; }
            }
            lookup[code] = index;
          }
          postMessage({ ready: true });
        } else if (data.type === "frame") {
          const rgba = new Uint8ClampedArray(data.buffer), indices = new Uint8Array(width * height);
          for (let i = 0; i < indices.length; i++) indices[i] = lookup[((rgba[4*i] >> 3) << 10) | ((rgba[4*i+1] >> 3) << 5) | (rgba[4*i+2] >> 3)];
          chunks.push(bytes([33,249,4,4,...word(data.delay),0,0,44,0,0,0,0,...word(width),...word(height),0,8]));
          const packed = compress(indices);
          for (let i = 0; i < packed.length; i += 255) {
            const block = packed.subarray(i, i + 255); chunks.push(bytes([block.length]), block.slice());
          }
          chunks.push(bytes([0])); postMessage({ ready: true });
        } else if (data.type === "finish") {
          chunks.push(bytes([59]));
          const result = new Uint8Array(chunks.reduce((n, part) => n + part.length, 0));
          let offset = 0; for (const part of chunks) { result.set(part, offset); offset += part.length; }
          chunks = []; postMessage({ result }, [result.buffer]);
        }
      } catch (error) { postMessage({ error: error.message }); }
    };
  }
  function colors() {
    const palette = [];
    for (const tone of [[9,102,84], [178,75,49]]) for (let i = 0; i < 96; i++) {
      palette.push(...[246,248,240].map((v,k) => Math.round(v + (tone[k] - v) * i / 95)));
    }
    for (let i = 0; i < 32; i++) palette.push(...Array(3).fill(Math.round(255 * i / 31)));
    for (const hex of [...NeuroViz.palette, "#fffefa", "#223931", "#dcebe2"]) palette.push(...hex.slice(1).match(/../g).map(v=>parseInt(v,16)));
    while (palette.length < 768) palette.push(255,255,255);
    return palette.slice(0,768);
  }
  function framePlan(total, interval, sample, speed) {
    if (!(interval > 0 && Number.isFinite(interval))) throw new Error("Set GIF frame interval to a positive number in Simulation.");
    const step = Math.max(sample, Math.ceil(interval / sample - 1e-9) * sample);
    const duration = total / speed;
    if (Math.min(total, step) / speed < 20 - 1e-9) throw new Error(`For this GIF frame interval, set playback speed to ${(Math.min(total, step) / 20).toFixed(2)}× or slower, or increase GIF frame interval in Simulation.`);
    const frames = Math.ceil(total / step);
    if (frames > 2000) throw new Error("This GIF would exceed 2,000 frames. Increase GIF frame interval in Simulation.");
    const fractions = Array.from({ length: frames }, (_, i) => i * step / total);
    if (fractions.length > 1 && (1 - fractions.at(-1)) * duration < 20) fractions.pop();
    return { duration, fractions };
  }
  async function encode({ renderFrame, frames = 20, duration = 1000, fractions, signal, onProgress }) {
    const url = URL.createObjectURL(new Blob([`(${encoderWorker.toString()})();`], { type: "text/javascript" }));
    const worker = new Worker(url); URL.revokeObjectURL(url);
    let waiting;
    const abort = () => { worker.terminate(); waiting?.reject(signal.reason); };
    const call = (payload, transfer = []) => new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      waiting = { resolve, reject }; worker.postMessage(payload, transfer);
    });
    worker.onmessage = ({ data }) => { const job = waiting; waiting = null; data.error ? job?.reject(new Error(data.error)) : job?.resolve(data); };
    worker.onerror = event => { waiting?.reject(new Error(event.message || "GIF encoding failed.")); waiting = null; };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const ticks = Math.max(2, Math.round(duration / 10));
      frames = fractions?.length || Math.max(1, Math.min(frames, Math.floor(ticks / 2)));
      let canvas = renderFrame(0);
      await call({ type: "start", width: canvas.width, height: canvas.height, palette: colors() });
      for (let i = 0; i < frames; i++) {
        signal?.throwIfAborted();
        const fraction = fractions ? fractions[i] : i / frames;
        const firstTick = Math.round(fraction * ticks);
        canvas = renderFrame(fraction);
        const rgba = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        await call({ type: "frame", buffer: rgba.buffer, delay: Math.round((fractions ? (fractions[i + 1] ?? 1) : (i + 1) / frames) * ticks) - firstTick }, [rgba.buffer]);
        onProgress?.((i + 1) / frames);
      }
      return new Blob([(await call({ type: "finish" })).result], { type: "image/gif" });
    } finally { worker.terminate(); signal?.removeEventListener("abort", abort); }
  }
  function control({ renderFrame, filename, signal, onError, beforeStart, plan, duration = () => 1000 }) {
    const button = document.createElement("button"); button.type = "button";
    NeuroUI.iconize(button, "download", "Download activity GIF");
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      beforeStart?.(); button.disabled = true; button.setAttribute("aria-busy", "true");
      try {
        const planned = plan?.();
        const durationMs = planned?.duration ?? duration();
        const blob = await encode({ renderFrame, signal, fractions: planned?.fractions, duration: durationMs, frames: Math.min(180, Math.max(1, Math.round(durationMs / 50))), onProgress: fraction => { button.title = `Preparing GIF · ${Math.round(fraction * 100)}%`; } });
        signal?.throwIfAborted();
        const url = URL.createObjectURL(blob), link = document.createElement("a");
        link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (error) { if (error.name !== "AbortError") onError?.(error); }
      finally { button.disabled = false; button.removeAttribute("aria-busy"); button.title = "Download activity GIF"; }
    });
    return button;
  }
  function compose(items, time) {
    const frame = document.createElement("canvas"), width = items[0].canvas.width, height = items[0].canvas.height;
    frame.width = width * items.length; frame.height = height + 70;
    const ctx = frame.getContext("2d"); ctx.fillStyle = "#fffefa"; ctx.fillRect(0,0,frame.width,frame.height);
    items.forEach(({ canvas, title, center = 0, scale = 1, unit = "" }, i) => {
      const left = i * width;
      ctx.fillStyle = "#223931"; ctx.font = "600 16px sans-serif"; ctx.fillText(title, left + 14, 23);
      ctx.drawImage(canvas, left, 34);
      const x = left + 14, y = height + 48, length = Math.min(120, width / 4);
      for (let j = 0; j < length; j++) { ctx.fillStyle = NeuroViz.activityColor((2*j/(length-1)-1)*scale, scale); ctx.fillRect(x+j,y-9,1,10); }
      ctx.fillStyle = "#223931"; ctx.font = "12px sans-serif";
      ctx.fillText(`${NeuroViz.number(center-scale)} … ${NeuroViz.number(center+scale)} ${unit}`, x+length+8, y);
      ctx.textAlign = "right"; ctx.fillText(`${NeuroViz.number(time, 8)} ms`, left+width-14,y); ctx.textAlign = "left";
    });
    return frame;
  }
  globalThis.NeuroGIF = { encode, control, compose, framePlan };
})();
