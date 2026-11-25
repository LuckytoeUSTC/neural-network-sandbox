(() => {
  "use strict";
  const palette = ["#086955", "#654da0", "#a74d2d", "#285f9d", "#996600", "#13767c", "#a33d6f", "#495ca5", "#447448", "#a24f5b", "#426470", "#70541d"];
  const ink = "#223931", faint = "#dfe8e2", paper = "#fffefa";
  const number = (value, precision = 3) => {
    const size = Math.abs(value);
    if (!Number.isFinite(value)) return "—";
    if (!size) return "0";
    const decimals = Math.max(0, Math.min(100, precision - 1 - Math.floor(Math.log10(size))));
    return Number(value.toPrecision(precision)).toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  };
  function numericFormat(low, high = low) {
    const bound = Math.max(Math.abs(low || 0), Math.abs(high || 0));
    const scaled = bound;
    const decimals = Math.max(0, Math.min(100, 4 - Math.floor(Math.log10(scaled || 1))));
    const integerWidth = Math.max(1, Number(scaled.toFixed(decimals)).toFixed(0).length);
    return value => {
      if (!Number.isFinite(value)) return "—";
      const rounded = Number(value.toFixed(decimals));
      const text = Math.abs(rounded).toFixed(decimals).padStart(integerWidth + (decimals ? decimals + 1 : 0), " ");
      return (rounded < 0 ? "−" : " ") + text;
    };
  }
  const mix = (a, b, amount) => a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  const heat = (value, scale, bipolar = true) => {
    const weight = scale ? Math.min(1, Math.abs(value) / scale) : 0;
    const tone = bipolar && value < 0 ? [178, 75, 49] : [9, 102, 84];
    return `rgb(${mix([246, 248, 240], tone, weight).join(",")})`;
  };

  let probeId = 0;
  function probePanel() {
    const panel = document.createElement("div");
    panel.className = "plot-readout";
    panel.id = `plot-readout-${++probeId}`;
    panel.setAttribute("aria-live", "off");
    return panel;
  }

  function linkProbe(frame, panel) {
    const data = document.createElement("div");
    data.className = "readout-panel";
    data.append(panel); frame.append(data);
    frame.querySelector("canvas").setAttribute("aria-describedby", panel.id);
    return frame;
  }

  function fieldsReadout(labels, formats = []) {
    const panel = probePanel(), list = document.createElement("dl");
    panel.style.setProperty("--readout-width", `${labels.length * 144 + (labels.length - 1) * 24}px`);
    list.className = "probe-fields";
    const outputs = labels.map(label => {
      const field = document.createElement("div"), term = document.createElement("dt"), detail = document.createElement("dd");
      const output = document.createElement("span");
      output.className = "probe-value";
      term.textContent = label;
      detail.append(output); field.append(term, detail); list.append(field);
      return output;
    });
    panel.append(list);
    panel.update = (values, event) => {
      panel.setAttribute("aria-live", event?.type === "keydown" ? "polite" : "off");
      outputs.forEach((output, i) => { output.textContent = formats[i] ? formats[i](values[i]) : values[i]; });
    };
    return panel;
  }

  function seriesReadout(series, timeLabel, fullLast) {
    const panel = probePanel(), table = document.createElement("table"), caption = document.createElement("caption");
    const time = document.createElement("span");
    time.className = "probe-value probe-time";
    caption.append(`${timeLabel} · `, time);
    table.className = "probe-table";
    table.append(caption);
    const columns = [...new Set(series.map(line => line.condition ?? "Value"))];
    panel.style.setProperty("--readout-width", columns.length === 1 ? "340px" : columns.length === 2 ? "500px" : "640px");
    table.dataset.columns = columns.length;
    const colgroup = document.createElement("colgroup");
    for (let i = 0; i <= columns.length; i++) colgroup.append(document.createElement("col"));
    table.append(colgroup);
    const groups = [...new Set(series.map(line => line.group ?? line.label))];
    const head = table.createTHead().insertRow();
    for (const title of ["Recorded object", ...columns]) {
      const cell = document.createElement("th");
      cell.scope = "col"; cell.textContent = title; head.append(cell);
    }
    const body = table.createTBody(), outputs = new Map();
    for (const label of groups) {
      const row = body.insertRow(), name = document.createElement("th"), swatch = document.createElement("i");
      name.scope = "row";
      swatch.style.backgroundColor = series.find(line => (line.group ?? line.label) === label).color;
      swatch.setAttribute("aria-hidden", "true");
      name.append(swatch, label); row.append(name);
      for (const column of columns) {
        const cell = row.insertCell(), output = document.createElement("span");
        cell.dataset.label = column;
        output.className = "probe-value"; cell.append(output);
        const line = series.find(item => (item.group ?? item.label) === label && (item.condition ?? "Value") === column);
        if (line) outputs.set(line, output);
        else output.textContent = "—";
      }
    }
    panel.append(table);
    const formats = new Map(columns.map(column => {
      const lines = series.filter(line => (line.condition ?? "Value") === column);
      const [low, high] = seriesRange(lines, 0, fullLast); return [column, numericFormat(low, high)];
    }));
    panel.update = (point, ms, event) => {
      panel.setAttribute("aria-live", event?.type === "keydown" ? "polite" : "off");
      time.textContent = `${number(ms, 8)} ms`;
      for (const [line, output] of outputs) output.textContent = formats.get(line.condition ?? "Value")(line.at(point));
    };
    return panel;
  }

  function chart(title, height, render, inspect) {
    const frame = document.createElement("section");
    frame.className = "viz-card";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", title);
    canvas.setAttribute("role", inspect ? "application" : "img");
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    canvas.style.display = "block";
    if (inspect) canvas.tabIndex = 0;
    frame.append(heading, canvas);
    let geometry = null, observer, pending = 0, disposed = false;
    const redraw = () => {
      if (disposed) return;
      const { width, height: drawHeight } = canvas.getBoundingClientRect();
      if (!width) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(drawHeight * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, width, drawHeight);
      geometry = render(ctx, width, drawHeight);
      ctx.restore();
    };
    function schedule() {
      if (disposed || pending) return;
      pending = requestAnimationFrame(() => { pending = 0; if (canvas.isConnected) redraw(); });
    }
    const initialFrame = requestAnimationFrame(() => {
      if (disposed || !canvas.isConnected) return;
      redraw();
      observer = new ResizeObserver(schedule);
      observer.observe(canvas);
    });
    frame.dispose = () => {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      cancelAnimationFrame(initialFrame);
      cancelAnimationFrame(pending);
    };
    frame.refresh = schedule;
    frame.paintNow = redraw;
    frame.capture = (width = 640, height = 420) => {
      if (disposed) throw new DOMException("The plot was closed.", "AbortError");
      const snapshot = document.createElement("canvas"); snapshot.width = width; snapshot.height = height;
      const ctx = snapshot.getContext("2d"); ctx.fillStyle = paper; ctx.fillRect(0, 0, width, height);
      ctx.save(); render(ctx, width, height, true); ctx.restore();
      return snapshot;
    };
    if (inspect) {
      for (const action of ["pointermove", "pointerdown", "keydown"]) {
        canvas.addEventListener(action, event => {
          if (!geometry) redraw();
          if (geometry) inspect(event, geometry, schedule);
        });
      }
    }
    return frame;
  }

  function bounds(w, h) {
    return { left: 66, right: w - 19, top: 19, bottom: h - 43 };
  }

  function ticks(low, high, count) {
    const raw = (high - low) / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].find(guess => guess * magnitude >= raw) * magnitude;
    const list = [];
    for (let value = Math.ceil(low / step - 1e-9) * step; value < high + step * 1e-8; value += step) {
      list.push(Math.abs(value) < step * 1e-8 ? 0 : value);
    }
    return list;
  }

  function timeAxis(ctx, b, start, end, stimulus) {
    const x = t => b.left + (t - start) / (end - start) * (b.right - b.left);
    ctx.fillStyle = "#e8eedb";
    for (const event of stimulus ?? []) {
      const a = Math.max(start, event.start), z = Math.min(end, event.end);
      if (z > a) ctx.fillRect(x(a), b.top, x(z) - x(a), b.bottom - b.top);
    }
    ctx.fillStyle = "#a9b789";
    for (const event of stimulus ?? []) {
      const a = Math.max(start, event.start), z = Math.min(end, event.end);
      if (z > a) ctx.fillRect(x(a), b.top - 6, x(z) - x(a), 4);
    }
    ctx.lineWidth = 1;
    const count = Math.max(2, Math.floor((b.right - b.left) / 90));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "13px system-ui, sans-serif";
    for (const time of ticks(start, end, count)) {
      const column = x(time);
      ctx.strokeStyle = faint;
      ctx.beginPath(); ctx.moveTo(column, b.top); ctx.lineTo(column, b.bottom); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(number(time, 8), column, b.bottom + 8);
    }
    ctx.textAlign = "right";
    ctx.fillText("Time (ms)", b.right, b.bottom + 25);
    return x;
  }

  function seriesRange(series, start, end) {
    let low = Infinity, high = -Infinity;
    for (const line of series) {
      for (let i = start; i <= end; i++) {
        const value = line.at(i);
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
    const margin = high > low ? (high - low) * 0.06 : Math.max(0.1, Math.abs(low) * 0.04);
    return [low - margin, high + margin];
  }

  function lines({ title, series, step, first, last, bands, height = 348, reference, timeOffset = 0, timeLabel = "Time", valueRange, timeRange, traceReadout = false, readoutSeries = series, secondarySeries = [], secondaryStep = step, secondaryLabel = "Input", secondaryVisible = true, fullLast = last, fullTime = fullLast * step, scaleSeries = series, scaleLast = fullLast }) {
    let cursor = first;
    const timeAt = p => p * step + timeOffset;
    const probe = seriesReadout(readoutSeries, timeLabel, fullLast);
    probe.update(cursor, timeAt(cursor));
    let range = valueRange ?? seriesRange(series, first, last), lockedRange;
    let domain = timeRange ?? [timeAt(first), timeAt(last)];
    let secondaryFirst = Math.round(domain[0] / secondaryStep), secondaryLast = Math.round(domain[1] / secondaryStep);
    const secondaryRange = secondarySeries.length ? seriesRange(secondarySeries, 0, Math.round(fullTime / secondaryStep)) : null;
    const frame = chart(title, height, (ctx, w, h) => {
      const [low, high] = range;
      const tickFormat = numericFormat(low, high);
      const b = bounds(w, h);
      ctx.font = "13px system-ui, sans-serif";
      b.left = Math.max(40, ...ticks(low, high, 5).map(value => ctx.measureText(tickFormat(value)).width + 10));
      b.right = w - Math.max(19, ctx.measureText(number(fullTime, 8)).width / 2 + 5);
      const x = timeAxis(ctx, b, domain[0], domain[1], bands);
      const secondaryY = value => b.bottom - (value - secondaryRange[0]) / (secondaryRange[1] - secondaryRange[0]) * (b.bottom - b.top);
      const y = value => b.bottom - (value - low) / (high - low) * (b.bottom - b.top);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const value of ticks(low, high, 5)) {
        const vertical = y(value);
        ctx.strokeStyle = faint;
        ctx.beginPath(); ctx.moveTo(b.left, vertical); ctx.lineTo(b.right, vertical); ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillText(tickFormat(value), b.left - 8, vertical);
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top); ctx.clip();
      if (reference !== undefined && reference >= low && reference <= high) {
        ctx.strokeStyle = "#7d8176"; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(b.left, y(reference)); ctx.lineTo(b.right, y(reference)); ctx.stroke();
      }
      for (const line of [...series, ...(secondaryVisible ? secondarySeries : [])]) {
        const secondary = secondarySeries.includes(line);
        const start = secondary ? secondaryFirst : first, end = secondary ? secondaryLast : last;
        const lineTime = secondary ? p => p * secondaryStep : timeAt, lineY = secondary ? secondaryY : y;
        ctx.strokeStyle = line.color;
        ctx.setLineDash(line.dash ? [4, 4] : []);
        ctx.globalAlpha = line.dash ? 0.63 : 1;
        ctx.lineWidth = line.width ?? (line.dash ? 1.25 : 1.8);
        ctx.beginPath();
        const block = Math.max(1, Math.floor((end - start) / (2 * (b.right - b.left))));
        for (let p = start; p <= end; p += block) {
          let min = p, max = p;
          for (let q = p + 1; q < Math.min(end + 1, p + block); q++) {
            if (line.at(q) < line.at(min)) min = q;
            if (line.at(q) > line.at(max)) max = q;
          }
          const firstInBlock = Math.min(min, max), lastInBlock = Math.max(min, max);
          if (line.stairs && p !== start) ctx.lineTo(x(lineTime(p)), lineY(line.at(p - 1)));
          ctx.lineTo(x(lineTime(firstInBlock)), lineY(line.at(firstInBlock)));
          if (min !== max) ctx.lineTo(x(lineTime(lastInBlock)), lineY(line.at(lastInBlock)));
        }
        ctx.stroke();
      }
      ctx.restore();
      if (cursor !== null) {
        const pos = x(timeAt(cursor));
        ctx.strokeStyle = "#50695f";
        ctx.beginPath(); ctx.moveTo(pos, b.top); ctx.lineTo(pos, b.bottom); ctx.stroke();
      }
      return b;
    }, (event, b, redraw) => {
      const previous = cursor;
      if (event.type === "keydown") {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        cursor = (cursor ?? first) + (event.key === "ArrowLeft" ? -1 : 1);
      } else {
        const time = domain[0] + (domain[1] - domain[0]) * (event.offsetX - b.left) / (b.right - b.left);
        cursor = Math.round((time - timeOffset) / step);
      }
      cursor = Math.max(first, Math.min(last, cursor));
      if (previous === cursor) return;
      probe.update(cursor, timeAt(cursor), event);
      redraw();
    });
    if (secondarySeries.length) frame.querySelector("canvas").setAttribute("aria-label", `${title}; ${secondaryLabel} overlay with an independent scale`);
    frame.updateWindow = options => {
      const previous = first;
      first = options.first; last = options.last;
      if (options.timeOffset !== undefined) timeOffset = options.timeOffset;
      domain = timeRange ?? [timeAt(first), timeAt(last)];
      secondaryFirst = Math.round(domain[0] / secondaryStep); secondaryLast = Math.round(domain[1] / secondaryStep);
      if (options.locked && !lockedRange) lockedRange = valueRange ?? seriesRange(scaleSeries, 0, scaleLast);
      range = options.locked ? lockedRange : valueRange ?? seriesRange(series, first, last);
      cursor = Math.max(first, Math.min(last, cursor + (options.locked ? first - previous : 0)));
      probe.update(cursor, timeAt(cursor)); frame.refresh();
    };
    frame.showSecondary = visible => { secondaryVisible = visible; frame.refresh(); };
    if (traceReadout) { frame.classList.add("trace-chart"); frame.style.setProperty("--plot-height", `${height}px`); }
    return linkProbe(frame, probe);
  }

  function activity({ title, count, labels, first, last, step, value, events, bands, fullLast = last, rowLabel = "Neuron", valueLabel = "Activity" }) {
    const height = Math.max(285, Math.min(630, 84 + count * 16));
    let selection = [first, 0];
    let numericBound = 0;
    for (let p = 0; p <= fullLast; p++) for (let i = 0; i < count; i++) numericBound = Math.max(numericBound, Math.abs(value(p, i)) || 0);
    const activityFormat = numericFormat(-numericBound, numericBound);
    const probe = fieldsReadout(["Time", rowLabel, events ? "Spikes per sample interval" : valueLabel], [null, null, activityFormat]);
    const updateProbe = (p, i, event) => probe.update([`${number(p * step, 8)} ms`, labels[i], value(p, i)], event);
    updateProbe(first, 0);
    let locked = false, fullScale;
    const frame = chart(title, height, (ctx, w, h) => {
      const b = bounds(w, h), x = timeAxis(ctx, b, first * step, last * step, bands);
      const pitch = (b.bottom - b.top) / count;
      const row = i => b.top + i * pitch;
      const visible = Math.floor((b.right - b.left) / 2);
      const chunk = Math.max(1, Math.ceil((last - first) / visible));
      let scale = 0;
      if (!events && locked && fullScale !== undefined) scale = fullScale;
      else if (!events) {
        const a = locked ? 0 : first, z = locked ? fullLast : last;
        for (let i = 0; i < count; i++) for (let p = a; p <= z; p++) scale = Math.max(scale, Math.abs(value(p, i)));
        if (locked) fullScale = scale;
      }
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const labelStep = Math.max(1, Math.ceil(15 / pitch));
      for (let i = 0; i < count; i++) {
        if (i % labelStep === 0) {
          ctx.fillStyle = ink;
          ctx.fillText(labels[i], b.left - 8, row(i) + pitch / 2);
        }
        if (events) {
          ctx.fillStyle = palette[0];
          for (const spike of events[i]) {
            if (spike >= first * step && spike <= last * step) ctx.fillRect(x(spike), row(i) + 0.5, 1.7, Math.max(1, pitch - 1));
          }
        } else {
          for (let p = first; p < last; p += chunk) {
            const stop = Math.min(last, p + chunk);
            let total = 0;
            for (let q = p; q < stop; q++) total += value(q, i);
            ctx.fillStyle = heat(total / (stop - p), scale);
            ctx.fillRect(x(p * step), row(i), x(stop * step) - x(p * step) + 0.2, pitch + 0.1);
          }
        }
      }
      if (!events) {
        ctx.fillStyle = ink;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`Scale ${numericFormat(-scale, scale)(-scale)} · ${numericFormat(-scale, scale)(0)} · ${numericFormat(-scale, scale)(scale)}`, b.left, b.bottom + 25);
      }
      if (selection) {
        const [p, i] = selection;
        ctx.strokeStyle = "#213c30";
        ctx.strokeRect(b.left, row(i), b.right - b.left, pitch);
        ctx.beginPath(); ctx.moveTo(x(p * step), b.top); ctx.lineTo(x(p * step), b.bottom); ctx.stroke();
      }
      return { ...b, pitch };
    }, (event, b, redraw) => {
      let [p, i] = selection ?? [first, 0];
      if (event.type === "keydown") {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault();
        p += delta[0]; i += delta[1];
      } else {
        if (event.offsetX < b.left || event.offsetX > b.right || event.offsetY < b.top || event.offsetY > b.bottom) return;
        p = Math.floor(first + (last - first) * (event.offsetX - b.left) / (b.right - b.left));
        i = Math.floor((event.offsetY - b.top) / b.pitch);
      }
      p = Math.max(first, Math.min(last, p));
      i = Math.max(0, Math.min(count - 1, i));
      if (selection?.[0] === p && selection?.[1] === i) return;
      selection = [p, i];
      updateProbe(p, i, event);
      redraw();
    });
    frame.updateWindow = options => {
      const previous = first; first = options.first; last = options.last; locked = options.locked;
      selection[0] = Math.max(first, Math.min(last, selection[0] + (locked ? first - previous : 0)));
      updateProbe(...selection); frame.refresh();
    };
    return linkProbe(frame, probe);
  }

  function matrix({ title, data, labels, initial, onSelect, unit = "", valueLabel = "Weight", direction = true, colorScale, pairLabel = "Neuron pair" }) {
    const n = labels.length;
    const height = 420;
    let selection = initial ?? [0, 0], hover = null;
    let scale = colorScale ?? 0;
    if (colorScale === undefined) for (const row of data) for (const entry of row) scale = Math.max(scale, Math.abs(entry));
    const valueFormat = numericFormat(-scale, scale);
    const probe = fieldsReadout([direction ? "Connection (Source → Target)" : pairLabel, valueLabel]);
    const updateProbe = (to, from, event) => probe.update([
      direction ? `${labels[from]} → ${labels[to]}` : `${labels[to]} × ${labels[from]}`,
      valueFormat(data[to][from]) + unit
    ], event);
    updateProbe(...selection);
    const raster = document.createElement("canvas"); raster.width = n; raster.height = n;
    const pixels = raster.getContext("2d").createImageData(n, n);
    for (let to = 0; to < n; to++) for (let from = 0; from < n; from++) {
      const value = data[to][from], amount = scale ? Math.min(1, Math.abs(value) / scale) : 0;
      const tone = value < 0 ? [178, 75, 49] : [9, 102, 84], base = [246, 248, 240], offset = (to * n + from) * 4;
      for (let c = 0; c < 3; c++) pixels.data[offset + c] = Math.round(base[c] + (tone[c] - base[c]) * amount);
      pixels.data[offset + 3] = 255;
    }
    raster.getContext("2d").putImageData(pixels, 0, 0);
    const frame = chart(title, height, (ctx, w, h) => {
      const size = Math.min(w - 52, h - 72), left = (w - size) / 2, top = 18, c = size / n;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(raster, left, top, size, size);
      if (selection) {
        ctx.strokeStyle = "#087f79";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(left + selection[1] * c + 0.5, top + selection[0] * c + 0.5, c, c);
      }
      if (hover && (hover[0] !== selection?.[0] || hover[1] !== selection?.[1])) {
        ctx.strokeStyle = "#c36b31"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.strokeRect(left + hover[1] * c + 0.5, top + hover[0] * c + 0.5, c, c); ctx.setLineDash([]);
      }
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = ink;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const skip = Math.max(1, Math.ceil(29 / c));
      for (let i = 0; i < n; i += skip) ctx.fillText(labels[i], left - 7, top + (i + 0.5) * c);
      ctx.textAlign = "center";
      for (let i = 0; i < n; i += skip) ctx.fillText(labels[i], left + (i + 0.5) * c, top + size + 13);
      const marks = [[-scale, valueFormat(-scale)], [0, valueFormat(0)], [scale, valueFormat(scale)]];
      const legendY = top + size + 33;
      for (let k = 0; k < marks.length; k++) {
        const x = left + (k / 2) * Math.max(0, size - 45);
        ctx.fillStyle = heat(marks[k][0], scale);
        ctx.fillRect(x, legendY - 6, 12, 12);
        ctx.fillStyle = ink; ctx.textAlign = "left";
        ctx.fillText(marks[k][1] + (k === 2 ? unit : ""), x + 16, legendY);
      }
      return { left, top, c };
    }, (event, b, redraw) => {
      let [to, from] = hover ?? selection ?? [0, 0];
      if (event.type === "keydown") {
        const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); selection = [to, from]; hover = null;
          updateProbe(to, from, event); redraw(); onSelect?.(to, from); return;
        }
        if (!delta) return;
        event.preventDefault(); to += delta[0]; from += delta[1];
      } else {
        to = Math.floor((event.offsetY - b.top) / b.c); from = Math.floor((event.offsetX - b.left) / b.c);
        if (Math.min(to, from) < 0 || Math.max(to, from) >= n) {
          if (hover) { hover = null; updateProbe(...selection, event); redraw(); }
          return;
        }
      }
      to = Math.max(0, Math.min(n - 1, to)); from = Math.max(0, Math.min(n - 1, from));
      if (event.type === "pointerdown") {
        selection = [to, from]; hover = null; updateProbe(to, from, event); redraw(); onSelect?.(to, from); return;
      }
      if (hover?.[0] === to && hover?.[1] === from) return;
      hover = [to, from]; updateProbe(to, from, event); redraw();
    });
    frame.querySelector("canvas").addEventListener("pointerleave", () => {
      hover = null; updateProbe(...selection); frame.refresh();
    });
    return linkProbe(frame, probe);
  }

  function spectrum(values) {
    return chart("Sample covariance eigenvalues", 318, (ctx, w, h) => {
      const b = bounds(w, h), high = values[0] || 1;
      const dx = (b.right - b.left) / values.length;
      for (let k = 0; k < 5; k++) {
        const fraction = k / 4, y = b.bottom - fraction * (b.bottom - b.top);
        ctx.strokeStyle = faint;
        ctx.beginPath(); ctx.moveTo(b.left, y); ctx.lineTo(b.right, y); ctx.stroke();
        ctx.fillStyle = ink; ctx.font = "13px system-ui"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(numericFormat(0, high)(high * fraction), b.left - 8, y);
      }
      for (let i = 0; i < values.length; i++) {
        const bar = values[i] / high * (b.bottom - b.top);
        ctx.fillStyle = i === 0 ? "#a74d2d" : "#086955";
        ctx.fillRect(b.left + dx * i, b.bottom - bar, Math.max(1, dx - 2), bar);
      }
      ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.fillText("Eigenvalue rank (descending)", (b.left + b.right) / 2, h - 12);
    });
  }

  const graphNetworks = new WeakMap();
  function graph({ result, observed, selected, select, onlySelected, activity, scale = 1, positions: initialPositions = null, interactive = false, viewport = { k: 1, x: 0, y: 0 }, nodeSize = 1, territory = false, onMove, onDrag }) {
    const { network, config, input } = result;
    const { n, topology } = config, observedSet = new Set(observed), targets = new Set(input.flatMap(item => item.cells));
    let cached = graphNetworks.get(network);
    if (!cached) {
      const overview = network.edges.length > 130 ? [...network.edges].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 100) : network.edges;
      const groups = network.groupNames.map(() => []);
      for (const id of network.order) groups[network.group[id]].push(id);
      cached = { overview, groups }; graphNetworks.set(network, cached);
    }
    const dense = network.edges.length > 130;
    const edges = onlySelected && selected !== null ? network.edges.filter(edge => edge.from === selected || edge.to === selected) :
      cached.overview;
    const adjacent = new Set(edges.flatMap(edge => edge.from === selected ? [edge.to] : edge.to === selected ? [edge.from] : []));
    const title = "Nodes";
    const height = topology === "chain" ? Math.min(390, Math.max(156, Math.ceil(n / 10) * 56 + 44)) : 390;
    const groups = cached.groups;
    let layout = null, customPositions = initialPositions, screenLayout = null;
    const colorField = globalThis.NeuroTerritory?.field(() => frame.refresh());
    // Topology is fixed for this chart. Only a resize invalidates its layout.
    function geometry(w, h) {
      if (layout?.width === w && layout.height === h) return layout;
      const radius = Math.max(0, Math.min(w, h) / 2 - 28);
      const baseRadius = n > 60 ? 4 : n > 32 ? 6 : n > 15 ? 9 : 14;
      const columns = Math.min(n, Math.max(4, Math.floor(w / 36)));
      const nodeR = topology === "chain" && n > 1 ? Math.min(baseRadius, Math.max(4, (w - 58) / (columns - 1) * .29)) : baseRadius;
      const positions = network.order.map((cell, i) => {
        if (customPositions) return [customPositions[cell][0] * w, customPositions[cell][1] * h];
        if (topology === "chain" && n > 1) {
          const columns = Math.min(n, Math.max(4, Math.floor(w / 36))), rows = Math.ceil(n / columns);
          const row = Math.floor(i / columns), column = row % 2 ? columns - 1 - i % columns : i % columns;
          return [29 + (w - 58) * column / (columns - 1), rows === 1 ? h / 2 : 36 + (h - 72) * row / (rows - 1)];
        }
        if (groups.length > 1) {
          const group = network.group[cell], member = groups[group].indexOf(cell), size = groups[group].length;
          const multi = groups.length > 2;
          const groupAngle = Math.PI * (2 * group / groups.length + (multi ? -0.5 : 1));
          const groupRadius = Math.min(w, h) * (multi ? 0.27 : 0.24);
          const localAngle = member * 2 * Math.PI / size - Math.PI / 2;
          const localRadius = Math.min(w, h) * (multi ? Math.min(0.14, 0.49 / groups.length) : 0.18);
          return [w / 2 + groupRadius * Math.cos(groupAngle) + (size > 1 ? localRadius * Math.cos(localAngle) : 0),
            h / 2 + groupRadius * Math.sin(groupAngle) + (size > 1 ? localRadius * Math.sin(localAngle) : 0)];
        }
        const angle = i * 2 * Math.PI / n - Math.PI / 2;
        return [w / 2 + (n === 1 ? 0 : radius * Math.cos(angle)), h / 2 + (n === 1 ? 0 : radius * Math.sin(angle))];
      });
      layout = { width: w, height: h, positions, nodeR };
      return layout;
    }
    const frame = chart(title, height, (ctx, w, h, capture = false) => {
      const base = geometry(w, h), positions = base.positions, nodeR = base.nodeR * nodeSize;
      const project = ([x, y]) => [(x - w / 2) * viewport.k + w / 2 + viewport.x * w, (y - h / 2) * viewport.k + h / 2 + viewport.y * h];
      const key = `${w},${h},${viewport.k},${viewport.x},${viewport.y}`;
      if (screenLayout?.source !== positions || screenLayout.key !== key) screenLayout = { source: positions, key, positions: positions.map(project) };
      const values = activity ? network.order.map(cell => activity(cell)) : [];
      const colors = activity ? values.map(value => heat(value, scale)) : [];
      if (territory && activity) colorField.paint(ctx, w, h, screenLayout.positions, colors, Math.max(nodeR * 2.8, Math.min(w, h) / Math.sqrt(n) * .8) * viewport.k, capture);
      ctx.save(); ctx.translate(w / 2 + viewport.x * w, h / 2 + viewport.y * h); ctx.scale(viewport.k, viewport.k); ctx.translate(-w / 2, -h / 2);
      for (const { from, to, value } of edges) {
        const [x, y] = positions[from], [tx, ty] = positions[to], focus = selected === from || selected === to;
        const color = value > 0 ? "#147b63" : "#b75431", magnitude = Math.abs(value) / network.maxAbs;
        const angle = Math.atan2(ty - y, tx - x), ux = Math.cos(angle), uy = Math.sin(angle);
        ctx.globalAlpha = focus ? .98 : selected !== null ? .18 : dense ? .3 : .8;
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = .8 + 2 * magnitude; ctx.lineCap = "butt";
        ctx.setLineDash(value < 0 ? [4, 3] : []);
        if (from === to) {
          ctx.beginPath(); ctx.arc(x + nodeR, y - nodeR, nodeR * .9, 0, Math.PI * 1.9); ctx.stroke();
        } else {
          const available = Math.max(1, Math.hypot(tx - x, ty - y) - 2 * nodeR - 4);
          const tipX = tx - (nodeR + 2) * ux, tipY = ty - (nodeR + 2) * uy;
          const head = Math.min(9, available * .58), half = Math.min(4.5, Math.max(1.8, head * .52));
          const baseX = tipX - head * ux, baseY = tipY - head * uy;
          ctx.beginPath(); ctx.moveTo(x + (nodeR + 2) * ux, y + (nodeR + 2) * uy);
          ctx.lineTo(baseX + ux, baseY + uy); ctx.stroke();
          ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(tipX, tipY);
          ctx.lineTo(baseX - half * uy, baseY + half * ux); ctx.lineTo(baseX + half * uy, baseY - half * ux);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 13px system-ui";
      for (const cell of network.order) {
        const [x, y] = positions[cell];
        const observedCell = observedSet.has(cell), active = selected === cell;
        const border = palette[network.group[cell] % palette.length];
        const value = values[cell];
        ctx.fillStyle = activity ? colors[cell] : active ? ink : observedCell ? "#dcebe2" : "#fffefa";
        ctx.strokeStyle = targets.has(cell) ? "#a74d2d" : border;
        ctx.lineWidth = active || targets.has(cell) || (activity && observedCell) ? 3 : 1.4;
        ctx.beginPath(); ctx.arc(x, y, nodeR, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        if (n <= 22 || active || (adjacent.has(cell) && onlySelected)) {
          ctx.fillStyle = nodeR >= 12 && (activity ? Math.abs(value) > scale * 0.52 : active) ? "#fffefa" : ink;
          ctx.fillText(cell + 1, x, y - (nodeR < 12 ? nodeR + 10 : 0));
        }
      }
      ctx.restore();
      return { positions: screenLayout.positions, nodeR: nodeR * viewport.k };
    }, (event, geometry) => {
      if (event.type === "keydown") {
        if (!["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
        event.preventDefault();
        select((selected === null ? 0 : (selected + (event.key === "ArrowLeft" ? -1 : 1) + n) % n), true);
      }
      if (interactive || event.type !== "pointerdown") return;
      const picked = geometry.positions.findIndex(([x, y]) => Math.hypot(x - event.offsetX, y - event.offsetY) <= geometry.nodeR + 6);
      if (picked !== -1) select(picked, true);
    });
    frame.normalizedPositions = () => {
      const { width, height } = frame.querySelector("canvas").getBoundingClientRect();
      return geometry(width, height).positions.map(([x, y]) => [x / width, y / height]);
    };
    frame.setPositions = target => {
      customPositions = target; layout = null;
      frame.onViewChange?.(); frame.refresh();
    };
    frame.setNodeSize = value => { nodeSize = value; frame.refresh(); };
    frame.setTerritory = value => { territory = value; frame.refresh(); };
    frame.cameraHome = () => {
      if (!customPositions?.length) return { x: 0, y: 0 };
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const [x, y] of customPositions) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      return { x: .5 - (left + right) / 2, y: .5 - (top + bottom) / 2 };
    };
    frame.resetCamera = () => {
      const home = frame.cameraHome();
      viewport.k = 1; viewport.x = home.x; viewport.y = home.y;
      frame.onViewChange?.(); frame.refresh();
    };
    const pointerEvents = new AbortController();
    if (interactive) {
      const canvas = frame.querySelector("canvas"); canvas.style.touchAction = "none";
      let drag = null;
      const local = event => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top, r.width, r.height]; };
      canvas.addEventListener("wheel", event => {
        event.preventDefault(); const [x, y, w, h] = local(event), previous = viewport.k;
        viewport.k = Math.max(.25, Math.min(8, previous * Math.exp(-event.deltaY * .0015)));
        viewport.x = (x - w / 2 - (x - w / 2 - viewport.x * w) * viewport.k / previous) / w;
        viewport.y = (y - h / 2 - (y - h / 2 - viewport.y * h) * viewport.k / previous) / h;
        frame.onViewChange?.(); frame.refresh();
      }, { passive: false, signal: pointerEvents.signal });
      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const [x, y, w, h] = local(event), g = geometry(w, h);
        const wx = (x - w / 2 - viewport.x * w) / viewport.k + w / 2, wy = (y - h / 2 - viewport.y * h) / viewport.k + h / 2;
        let id = -1, nearest = Infinity;
        g.positions.forEach(([px, py], i) => { const d = Math.hypot(px - wx, py - wy); if (d <= g.nodeR * nodeSize + 6 / viewport.k && d < nearest) { id = i; nearest = d; } });
        drag = { id, x, y, moved: false }; canvas.setPointerCapture(event.pointerId);
      }, { signal: pointerEvents.signal });
      canvas.addEventListener("pointermove", event => {
        if (!drag) return;
        const [x, y, w, h] = local(event), dx = x - drag.x, dy = y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 3) return;
        drag.moved = true;
        if (drag.id < 0) { viewport.x += dx / w; viewport.y += dy / h; frame.onViewChange?.(); }
        else {
          const position = [((x - w / 2 - viewport.x * w) / viewport.k + w / 2) / w, ((y - h / 2 - viewport.y * h) / viewport.k + h / 2) / h];
          const points = frame.normalizedPositions(); points[drag.id] = position; frame.setPositions(points); onMove?.(points); onDrag?.(drag.id, position, false);
        }
        drag.x = x; drag.y = y; frame.refresh();
      }, { signal: pointerEvents.signal });
      const release = event => {
        if (!drag) return; const previous = drag; drag = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (previous.moved && previous.id >= 0) onDrag?.(previous.id, null, true);
        else if (!previous.moved && previous.id >= 0 && event.type !== "pointercancel") select(previous.id, true);
      };
      canvas.addEventListener("pointerup", release, { signal: pointerEvents.signal });
      canvas.addEventListener("pointercancel", release, { signal: pointerEvents.signal });
    }
    const dispose = frame.dispose;
    frame.dispose = () => { pointerEvents.abort(); colorField?.dispose(); dispose(); };
    frame.edgeSummary = `Showing ${edges.length} of ${network.edges.length} connections across ${n} neurons. ` +
      (onlySelected ? "Only the selected neuron's connections are shown. " : dense ? "Overview keeps the strongest connections by absolute weight. " : "") +
      "Arrows point from source to target.";
    return frame;
  }

  function colorLegend(center, scale, label) {
    const legend = document.createElement("div"); legend.className = "activity-color-legend";
    legend.setAttribute("role", "img"); legend.setAttribute("aria-label", `${label}: ${number(center - scale)} to ${number(center + scale)}`);
    const title = document.createElement("div"); title.className = "color-legend-title"; title.textContent = label;
    const ramp = document.createElement("div"); ramp.className = "color-legend-ramp";
    ramp.style.background = scale ? `linear-gradient(to top, ${heat(-scale, scale)}, ${heat(0, scale)} 50%, ${heat(scale, scale)})` : heat(0, scale);
    const ticks = document.createElement("div"); ticks.className = "color-legend-ticks";
    for (const value of [center + scale, center, center - scale]) { const tick = document.createElement("span"); tick.textContent = numericFormat(center - scale, center + scale)(value); ticks.append(tick); }
    legend.append(title, ramp, ticks); return legend;
  }
  globalThis.NeuroViz = { palette, number, numericFormat, lines, activity, matrix, spectrum, graph, fieldsReadout, linkProbe, activityColor: heat, colorLegend };
})();
