# Browser 3D And WebGL

Use this reference when a child asks for a simple 3D-feeling game or scene. Felix mini apps do not include external game frameworks by default. Do not add remote scripts, run package installs, copy external example projects, or ask the child to set up tooling.

For Felix, prefer one of these local approaches:

- CSS 3D transforms for cards, rooms, cubes, parallax, and lightweight illusions.
- SVG or Canvas with perspective math for pseudo-3D tracks, tunnels, maps, or sprites.
- Raw WebGL only when the idea genuinely needs depth, shaders, or many transformed shapes.

## 3D Basics

Most 3D scenes need:

- A world coordinate system: `x` left/right, `y` up/down, and `z` depth.
- Objects with position, size, rotation, and color/material.
- A camera or viewpoint that decides what the player sees.
- Projection that turns 3D points into 2D screen pixels.
- A render loop that updates state and draws each frame.

Keep the first version tiny: one player object, one goal, one obstacle or collectible, clear controls, and obvious feedback.

## CSS 3D

CSS is a good fit for small scenes made from cards, panels, cubes, or layered worlds.

```css
.scene {
  perspective: 800px;
}

.piece {
  transform: translate3d(var(--x), var(--y), var(--z)) rotateY(var(--turn));
  transform-style: preserve-3d;
}
```

Use CSS 3D when the game is mostly UI-like and needs readable text, buttons, or panels.

## Canvas Perspective

Canvas can create a 3D-feeling scene without WebGL by scaling objects based on depth.

```js
function project(point) {
  const depth = Math.max(0.2, point.z + 6);
  const scale = 1 / depth;
  return {
    x: canvas.width / 2 + point.x * scale * 240,
    y: canvas.height / 2 - point.y * scale * 240,
    scale,
  };
}
```

Sort far objects before near objects so closer sprites draw on top.

## Raw WebGL

Use raw WebGL for simple local geometry when Canvas or CSS cannot do the job. Keep it compact:

- Create one `<canvas>`.
- Get a WebGL context.
- Compile a tiny vertex shader and fragment shader.
- Upload a small vertex buffer.
- Draw with `gl.drawArrays()` or `gl.drawElements()`.

Raw WebGL has more setup than Canvas. If the child asked for a normal 2D game, do not choose WebGL just because it sounds advanced.

## Felix Checks

Before saying a 3D scene works:

- Confirm important objects are visible and not behind the camera.
- Confirm controls still work after resizing the window.
- Keep text and buttons in normal DOM when possible so they stay readable.
- Respect reduced motion if camera movement or rotation is intense.
- Avoid external assets unless they are already local to the mini app.
