import { BufferGeometry, Float32BufferAttribute } from 'three';

// A closed rounded cube: 48 shared vertices and 92 triangles. Two segments
// around each edge give a curved silhouette while preserving broad, flat faces.
export function createRoundedCubeGeometry(radius = 0.1) {
  const outer = 0.5;
  const inner = outer - radius;
  const positions = [], normals = [], indices = [];
  const vertices = new Map();
  function vertex(point) {
    const key = point.map((coordinate) => coordinate.toFixed(9)).join(',');
    if (vertices.has(key)) return vertices.get(key);
    const index = positions.length / 3;
    vertices.set(key, index);
    positions.push(...point);
    const normal = point.map((coordinate) => Math.sign(coordinate) * Math.max(0, Math.abs(coordinate) - inner));
    const length = Math.hypot(...normal);
    normals.push(...normal.map((coordinate) => coordinate / length));
    return index;
  }
  function triangle(a, b, c) {
    const ab = b.map((coordinate, axis) => coordinate - a[axis]);
    const ac = c.map((coordinate, axis) => coordinate - a[axis]);
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const facing = normal.reduce((sum, coordinate, axis) => sum + coordinate * (a[axis] + b[axis] + c[axis]), 0);
    if (facing < 0) indices.push(vertex(a), vertex(c), vertex(b));
    else indices.push(vertex(a), vertex(b), vertex(c));
  }
  function quad(points) { triangle(points[0], points[1], points[2]); triangle(points[0], points[2], points[3]); }
  for (let axis = 0; axis < 3; axis++) {
    const [a, b] = [0, 1, 2].filter((candidate) => candidate !== axis);
    for (const sign of [-1, 1]) {
      quad([[-inner, -inner], [inner, -inner], [inner, inner], [-inner, inner]].map(([pa, pb]) => {
        const point = []; point[axis] = sign * outer; point[a] = pa; point[b] = pb; return point;
      }));
    }
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const edgePoint = (along, angle) => {
        const point = [];
        point[axis] = along;
        point[a] = sa * (inner + radius * Math.cos(angle));
        point[b] = sb * (inner + radius * Math.sin(angle));
        return point;
      };
      for (let segment = 0; segment < 2; segment++) {
        const start = segment * Math.PI / 4, end = (segment + 1) * Math.PI / 4;
        quad([edgePoint(-inner, start), edgePoint(inner, start), edgePoint(inner, end), edgePoint(-inner, end)]);
      }
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const arc = radius / Math.sqrt(2);
    const a = [sx * outer, sy * inner, sz * inner];
    const b = [sx * inner, sy * outer, sz * inner];
    const c = [sx * inner, sy * inner, sz * outer];
    const ab = [sx * (inner + arc), sy * (inner + arc), sz * inner];
    const ac = [sx * (inner + arc), sy * inner, sz * (inner + arc)];
    const bc = [sx * inner, sy * (inner + arc), sz * (inner + arc)];
    triangle(a, ab, ac);
    triangle(ab, b, bc);
    triangle(ac, bc, c);
    triangle(ab, bc, ac);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
