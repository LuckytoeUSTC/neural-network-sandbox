(() => {
  "use strict";
  // Spatial interpolation is only a display aid; node values remain unchanged.
  function weightsFor(positions, w, h, width, height, radius) {
    const count = Math.min(8, positions.length), ids = new Uint16Array(width * height * count), weights = new Float32Array(ids.length), alpha = new Uint8Array(width * height);
    function tree(indices, depth = 0) {
      if (!indices.length) return null;
      const axis = depth % 2; indices.sort((a, b) => positions[a][axis] - positions[b][axis]);
      const middle = indices.length >> 1;
      return { id: indices[middle], axis, left: tree(indices.slice(0, middle), depth + 1), right: tree(indices.slice(middle + 1), depth + 1) };
    }
    const root = tree(positions.map((_, i) => i));
    const distances = new Float64Array(count), nearest = new Uint16Array(count);
    function visit(node, x, y) {
      if (!node) return;
      const p = positions[node.id], dx = x - p[0], dy = y - p[1], distance = dx * dx + dy * dy;
      if (distance < distances[count - 1]) {
        let j = count - 1;
        while (j > 0 && distance < distances[j - 1]) { distances[j] = distances[j - 1]; nearest[j] = nearest[j - 1]; j--; }
        distances[j] = distance; nearest[j] = node.id;
      }
      const delta = node.axis ? dy : dx;
      visit(delta < 0 ? node.left : node.right, x, y);
      if (delta * delta < distances[count - 1]) visit(delta < 0 ? node.right : node.left, x, y);
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      distances.fill(Infinity); visit(root, (x + .5) * w / width, (y + .5) * h / height);
      const offset = (y * width + x) * count; let total = 0, density = 0;
      for (let j = 0; j < count; j++) { ids[offset + j] = nearest[j]; const support = Math.max(0, 1 - distances[j] / (radius * radius)); density += support ** 3; weights[offset + j] = support ** 9; total += weights[offset + j]; }
      if (total) for (let j = 0; j < count; j++) weights[offset + j] /= total;
      const coverage = Math.max(0, Math.min(1, (density - .12) / .06));
      alpha[y * width + x] = Math.round(255 * coverage * coverage * (3 - 2 * coverage));
    }
    return { ids, weights, alpha, count, width, height, radius };
  }
  function cpuField(onReady) {
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    let previous = null, raster, pixels, worker, busy = false, disposed = false, requested;
    function accept(value, positions) {
      raster = value; previous = positions; canvas.width = raster.width; canvas.height = raster.height;
      pixels = context.createImageData(raster.width, raster.height);
    }
    function build(positions, w, h, width, height, radius, synchronous) {
      if (synchronous) { accept(weightsFor(positions, w, h, width, height, radius), positions); return; }
      if (busy) return;
      if (!worker) {
        const source = `const weightsFor = ${weightsFor.toString()}; onmessage = ({data}) => { const result = weightsFor(...data); postMessage(result, [result.ids.buffer, result.weights.buffer, result.alpha.buffer]); };`;
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" })); worker = new Worker(url); URL.revokeObjectURL(url);
        worker.onmessage = ({ data }) => { busy = false; if (!disposed) { accept(data, requested); onReady?.(); } };
        worker.onerror = () => { busy = false; worker.terminate(); worker = null; };
      }
      busy = true; requested = positions; worker.postMessage([positions, w, h, width, height, radius]);
    }
    return {
      paint(ctx, w, h, positions, colors, radius, synchronous = false) {
        const width = Math.max(1, Math.round(Math.min(320, w))), height = Math.max(1, Math.round(Math.min(256, width * h / w)));
        if (!raster || previous !== positions || raster.width !== width || raster.height !== height || raster.radius !== radius) build(positions, w, h, width, height, radius, synchronous);
        if (!raster) return;
        const rgb = colors.map(color => color.match(/[\d.]+/g).slice(0, 3).map(Number)), { ids, weights, count } = raster;
        for (let pixel = 0; pixel < raster.width * raster.height; pixel++) {
          let r = 0, g = 0, b = 0;
          for (let j = 0; j < count; j++) { const index = pixel * count + j, tone = rgb[ids[index]], weight = weights[index]; r += tone[0] * weight; g += tone[1] * weight; b += tone[2] * weight; }
          pixels.data[4 * pixel] = r; pixels.data[4 * pixel + 1] = g; pixels.data[4 * pixel + 2] = b; pixels.data[4 * pixel + 3] = raster.alpha[pixel];
        }
        context.putImageData(pixels, 0, 0); ctx.drawImage(canvas, 0, 0, w, h);
      },
      dispose() { disposed = true; worker?.terminate(); raster = pixels = null; }
    };
  }

  // Two-pass, instanced splatting. No per-node uniform arrays or external runtime.
  function gpuField() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) { gl?.getExtension("WEBGL_lose_context")?.loseContext(); return null; }
    const shaders = [], programs = [], textures = [], buffers = [];
    let framebuffer, data = new Float32Array(0), capacity = 0, allocated = false, disposed = false;
    function program(vertex, fragment) {
      const p = gl.createProgram(); programs.push(p);
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type); shaders.push(shader); gl.shaderSource(shader, '#version 300 es\n' + source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(p, shader);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
    }
    function dispose() {
      if (disposed) return; disposed = true;
      textures.forEach(t => gl.deleteTexture(t)); buffers.forEach(b => gl.deleteBuffer(b));
      programs.forEach(p => gl.deleteProgram(p)); shaders.forEach(s => gl.deleteShader(s)); gl.deleteFramebuffer(framebuffer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    try {
      const splat = program(`
        precision highp float;
        layout(location=0) in vec2 position; layout(location=1) in vec3 color;
        uniform vec2 size; uniform float radius; out vec2 offset; out vec3 tone;
        void main() {
          vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
          offset=corners[gl_VertexID]; tone=color;
          vec2 p=(position+offset*radius)/size;
          gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0,1);
        }`, `
        precision highp float;
        in vec2 offset; in vec3 tone;
        layout(location=0) out vec4 weighted; layout(location=1) out vec4 density;
        void main() {
          float k=max(0.,1.-dot(offset,offset)); if(k==0.) discard;
          float d=k*k*k; float w=d*d*d;
          weighted=vec4(tone*w,w); density=vec4(d,0,0,0);
        }`);
      const resolve = program(`
        precision highp float; out vec2 uv;
        void main() { vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); uv=p; gl_Position=vec4(p*2.-1.,0,1); }`, `
        precision highp float; in vec2 uv; uniform sampler2D colors; uniform sampler2D density; out vec4 outputColor;
        void main() { vec4 c=texture(colors,uv); float d=texture(density,uv).r;
          outputColor=vec4(c.rgb/max(c.a,.000001),smoothstep(.12,.18,d)); }
      `);
      const sizeUniform = gl.getUniformLocation(splat, "size"), radiusUniform = gl.getUniformLocation(splat, "radius");
      gl.useProgram(resolve);
      gl.uniform1i(gl.getUniformLocation(resolve, "colors"), 0); gl.uniform1i(gl.getUniformLocation(resolve, "density"), 1);
      const buffer = gl.createBuffer(); buffers.push(buffer);
      framebuffer = gl.createFramebuffer();
      for(let i=0;i<2;i++) { const texture=gl.createTexture(); textures.push(texture); gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      }
      return {
        paint(ctx,w,h,positions,colors,radius) {
          if(disposed || gl.isContextLost()) return false;
          const factor=Math.min(1,1024/w,768/h), width=Math.max(1,Math.round(w*factor)), height=Math.max(1,Math.round(h*factor));
          if(!allocated || canvas.width!==width || canvas.height!==height) {
            canvas.width=width; canvas.height=height; gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
            textures.forEach((t,i)=> { gl.bindTexture(gl.TEXTURE_2D,t); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0); });
            gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
            if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) return false;
            allocated = true;
          }
          if(data.length!==positions.length*5) data=new Float32Array(positions.length*5);
          for(let i=0;i<positions.length;i++) { const rgb=colors[i].match(/[\d.]+/g); const o=i*5;
            data[o]=positions[i][0]; data[o+1]=positions[i][1]; for(let j=0;j<3;j++) data[o+2+j]=Number(rgb[j])/255;
          }
          gl.viewport(0,0,width,height); gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer); gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
          gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
          gl.useProgram(splat); gl.uniform2f(sizeUniform,w,h); gl.uniform1f(radiusUniform,radius);
          gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
          if(capacity!==data.byteLength) {capacity=data.byteLength;gl.bufferData(gl.ARRAY_BUFFER,capacity,gl.DYNAMIC_DRAW);}
          gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
          gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,20,0);gl.vertexAttribDivisor(0,1);
          gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,20,8);gl.vertexAttribDivisor(1,1);
          gl.drawArraysInstanced(gl.TRIANGLES,0,6,positions.length);
          gl.disableVertexAttribArray(0);gl.disableVertexAttribArray(1);
          gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(resolve);
          textures.forEach((t,i)=> {gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);});
          gl.drawArrays(gl.TRIANGLES,0,3);ctx.drawImage(canvas,0,0,w,h);return true;
        }, dispose
      };
    } catch(error) { dispose(); return null; }
  }
  function field(onReady) {
    let gpu, cpu, attempted=false;
    return {
      paint(...args) {
        if(!attempted) { attempted=true; gpu=gpuField(); }
        if(gpu?.paint(...args)) return;
        gpu?.dispose(); gpu=null; cpu ||= cpuField(onReady); cpu.paint(...args);
      },
      dispose() {gpu?.dispose();cpu?.dispose();},
      get backend() { return gpu ? "webgl2" : "canvas"; }
    };
  }
  globalThis.NeuroTerritory = { field };
})();
