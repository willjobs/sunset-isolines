import { zoneAt } from "./atlas-data.js";
const vertex = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
in vec3 a_position;
uniform mat4 u_matrix;
uniform int u_day;
uniform usampler2D u_offsets;
out vec2 v_world;
flat out int v_first;
void main(){v_world=a_position.xy;v_first=int(texelFetch(u_offsets,ivec2(int(a_position.z),u_day),0).r);gl_Position=u_matrix*vec4(a_position.xy,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_world;
flat in int v_first;
uniform int u_day;
uniform vec2 u_grid;
uniform sampler2D u_curves;
uniform vec3 u_colors[6];
out vec4 fragColor;
void main(){
 float f=clamp((v_world.y-u_grid.x)*u_grid.y,0.0,270.0);
 int row=min(269,int(f));float t=f-float(row);
 int bucket=5;
 for(int h=0;h<5;h++){
  int instant=v_first+h;
  float boundary;
  #ifdef LINEAR_CURVES
   boundary=texture(u_curves,vec2((float(instant*271)+f+0.5)/2439.0,(float(u_day)+0.5)/365.0)).r;
  #else
   float a=texelFetch(u_curves,ivec2(instant*271+row,u_day),0).r;
   float b=texelFetch(u_curves,ivec2(instant*271+row+1,u_day),0).r;
   boundary=mix(a,b,t);
  #endif
  if(v_world.x>boundary){bucket=h;break;}
 }
 fragColor=vec4(u_colors[bucket],1.0);
}`;
function shader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw Error(gl.getShaderInfoLog(s));
  return s;
}
export class SunsetLayer {
  id = "sunset-atlas";
  type = "custom";
  renderingMode = "2d";
  day = 59;
  constructor(data, colors, onPresented) {
    this.data = data;
    this.colors = colors;
    this.onPresented = onPresented;
  }
  onAdd(map, gl) {
    this.map = map;
    const linear = Boolean(gl.getExtension("OES_texture_float_linear"));
    this.linearSampling = linear;
    this.constantsSet = false;
    const vs = shader(gl, gl.VERTEX_SHADER, vertex),
      fs = shader(
        gl,
        gl.FRAGMENT_SHADER,
        linear
          ? fragment.replace(
              "#version 300 es",
              "#version 300 es\n#define LINEAR_CURVES",
            )
          : fragment,
      ),
      p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(p));
    this.program = p;
    this.uniforms = Object.fromEntries(
      [
        "u_matrix",
        "u_day",
        "u_curves",
        "u_grid",
        "u_offsets",
        "u_colors[0]",
      ].map((name) => [name, gl.getUniformLocation(p, name)]),
    );
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.vertices, gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(p, "a_position");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 12, 0);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const { meta, curves, ranges, offsets } = this.data;
    const texture = (
      internal,
      format,
      type,
      width,
      height,
      values,
      filter = gl.NEAREST,
    ) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internal,
        width,
        height,
        0,
        format,
        type,
        values,
      );
      return t;
    };
    const longitudes = new Float32Array(curves.length);
    for (let c = 0; c < 365 * meta.instantCount; c++)
      for (let k = 0; k < meta.latitudeCount; k++) {
        const i = c * meta.latitudeCount + k;
        longitudes[i] =
          (ranges[c * 2] + curves[i] * ranges[c * 2 + 1] + 180) / 360;
      }
    this.textures = [
      texture(
        gl.R32F,
        gl.RED,
        gl.FLOAT,
        meta.instantCount * meta.latitudeCount,
        365,
        longitudes,
        linear ? gl.LINEAR : gl.NEAREST,
      ),
      texture(
        gl.R8UI,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        meta.zones.length,
        365,
        offsets,
      ),
    ];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.palette = new Float32Array(
      this.colors.flatMap((c) =>
        c
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16) / 255),
      ),
    );
  }
  setDay(day) {
    this.day = day;
    this.requestedAt = performance.now();
    this.requestSerial = (this.requestSerial || 0) + 1;
    this.map?.triggerRepaint();
  }
  zoneAt(longitude, latitude) {
    const z = zoneAt(this.data, longitude, latitude);
    return z < 0 ? null : this.data.meta.zones[z].tzid;
  }
  render(gl, options) {
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.depthMask(false);
    gl.uniformMatrix4fv(
      this.uniforms.u_matrix,
      false,
      options.defaultProjectionData.mainMatrix,
    );
    gl.uniform1i(this.uniforms.u_day, this.day);
    if (!this.constantsSet) {
      gl.uniform3fv(this.uniforms["u_colors[0]"], this.palette);
      gl.uniform2f(
        this.uniforms.u_grid,
        this.data.meta.sampleYMin,
        1 / this.data.meta.sampleYStep,
      );
      gl.uniform1i(this.uniforms.u_curves, 0);
      gl.uniform1i(this.uniforms.u_offsets, 1);
      this.constantsSet = true;
    }
    for (let i = 0; i < this.textures.length; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
    }
    gl.drawElements(gl.TRIANGLES, this.data.indices.length, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    if (this.presentedSerial !== this.requestSerial) {
      this.lastPresentationMs = performance.now() - this.requestedAt;
      this.presentedSerial = this.requestSerial;
      this.onPresented(this.day);
    }
  }
  onRemove(map, gl) {
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    for (const t of this.textures) gl.deleteTexture(t);
    gl.deleteProgram(this.program);
  }
}
