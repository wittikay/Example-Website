const initAsciiCube = () => {
  const asciiTarget = document.getElementById("ascii-cube");
  if (!asciiTarget) {
    return;
  }

  let width = 80;
  let height = 36;
  const chars = " .:-=+*#%@█";
  const cubeVertices = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const cubeFaces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [0, 3, 7, 4],
  ];

  let rotX = 0.6;
  let rotY = 0.8;
  let targetX = rotX;
  let targetY = rotY;
  let isDragging = false;
  let lastPointer = { x: 0, y: 0 };

  const updateDimensions = () => {
    const measure = document.createElement("span");
    measure.textContent = "M";
    measure.style.visibility = "hidden";
    measure.style.position = "absolute";
    measure.style.whiteSpace = "pre";
    measure.style.fontFamily = getComputedStyle(asciiTarget).fontFamily;
    measure.style.fontSize = getComputedStyle(asciiTarget).fontSize;
    asciiTarget.appendChild(measure);
    const rect = measure.getBoundingClientRect();
    asciiTarget.removeChild(measure);

    const charWidth = rect.width || 10;
    const charHeight = rect.height || 16;
    const cols = Math.floor(asciiTarget.clientWidth / charWidth);
    const rows = Math.floor(asciiTarget.clientHeight / charHeight);
    width = Math.max(50, cols);
    height = Math.max(24, rows);
  };

  updateDimensions();
  window.addEventListener("resize", updateDimensions);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  asciiTarget.addEventListener("mousedown", (event) => {
    isDragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  asciiTarget.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - lastPointer.x;
    const deltaY = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    targetY -= deltaX * 0.01;
    targetX += deltaY * 0.01;
  });

  const rotate = (point, ax, ay) => {
    let [x, y, z] = point;
    const cosX = Math.cos(ax);
    const sinX = Math.sin(ax);
    const cosY = Math.cos(ay);
    const sinY = Math.sin(ay);
    let dy = y * cosX - z * sinX;
    let dz = y * sinX + z * cosX;
    let dx = x * cosY + dz * sinY;
    dz = -x * sinY + dz * cosY;
    return [dx, dy, dz];
  };

  const project = (point) => {
    const [x, y, z] = point;
    const depth = 3.5;
    const scale = 24 / (z + depth);
    return [x * scale, y * scale, z];
  };

  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  const normalize = (v) => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  };

  const toScreen = (p, offsetX, offsetY) => [width / 2 + p[0] + offsetX, height / 2 - (p[1] + offsetY), p[2]];

  const fillTriangle = (p1, p2, p3, intensity, buffer, depthBuffer) => {
    const minX = Math.max(0, Math.floor(Math.min(p1[0], p2[0], p3[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(p1[0], p2[0], p3[0])));
    const minY = Math.max(0, Math.floor(Math.min(p1[1], p2[1], p3[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(p1[1], p2[1], p3[1])));

    const area = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
    if (area === 0) return;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const w1 = (p2[0] - p1[0]) * (y - p1[1]) - (p2[1] - p1[1]) * (x - p1[0]);
        const w2 = (p3[0] - p2[0]) * (y - p2[1]) - (p3[1] - p2[1]) * (x - p2[0]);
        const w3 = (p1[0] - p3[0]) * (y - p3[1]) - (p1[1] - p3[1]) * (x - p3[0]);
        const hasNeg = w1 < 0 || w2 < 0 || w3 < 0;
        const hasPos = w1 > 0 || w2 > 0 || w3 > 0;
        if (hasNeg && hasPos) continue;

        const alpha = w2 / area;
        const beta = w3 / area;
        const gamma = 1 - alpha - beta;
        const z = p1[2] * alpha + p2[2] * beta + p3[2] * gamma;

        if (z > depthBuffer[y][x]) {
          depthBuffer[y][x] = z;
          const index = clamp(Math.floor(intensity * (chars.length - 1)), 0, chars.length - 1);
          buffer[y][x] = chars[index];
        }
      }
    }
  };

  const draw = () => {
    if (!isDragging) {
      targetY += 0.0045;
      targetX += 0.0025;
    }

    rotX += (targetX - rotX) * 0.08;
    rotY += (targetY - rotY) * 0.08;

    const buffer = Array.from({ length: height }, () => Array(width).fill(" "));
    const depthBuffer = Array.from({ length: height }, () => Array(width).fill(-Infinity));

    const rotated = cubeVertices.map((v) => rotate(v, rotX, rotY));
    const transformed = rotated.map((v) => project(v));
    const bounds = transformed.reduce(
      (acc, p) => {
        acc.minX = Math.min(acc.minX, p[0]);
        acc.maxX = Math.max(acc.maxX, p[0]);
        acc.minY = Math.min(acc.minY, p[1]);
        acc.maxY = Math.max(acc.maxY, p[1]);
        return acc;
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const offsetX = -centerX;
    const offsetY = -centerY;
    const lightDir = normalize([0.4, 0.6, 1]);

    cubeFaces.forEach((face) => {
      const [a, b, c, d] = face;
      const v1 = rotated[a];
      const v2 = rotated[b];
      const v3 = rotated[c];
      const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
      const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
      const normal = normalize(cross(edge1, edge2));
      const brightness = clamp(
        (normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2] + 1) / 2,
        0.15,
        1
      );

      const p1 = toScreen(transformed[a], offsetX, offsetY);
      const p2 = toScreen(transformed[b], offsetX, offsetY);
      const p3 = toScreen(transformed[c], offsetX, offsetY);
      const p4 = toScreen(transformed[d], offsetX, offsetY);

      fillTriangle(p1, p2, p3, brightness, buffer, depthBuffer);
      fillTriangle(p1, p3, p4, brightness, buffer, depthBuffer);
    });

    asciiTarget.textContent = buffer.map((row) => row.join("")).join("\n");
    requestAnimationFrame(draw);
  };

  draw();
};

window.App = window.App || {};
window.App.initAsciiCube = initAsciiCube;
