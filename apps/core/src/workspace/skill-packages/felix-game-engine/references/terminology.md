# Game Development Terminology

A comprehensive glossary of video game development terms and concepts, organized by category for quick reference.

Source: https://www.gameindustrycareerguide.com/video-game-development-terms-glossary/

---

## General Development Terms

### Large-Studio Game
A classification for games produced by large studios with significant budgets, large teams, and high production values. For Felix work, use this only as a scale reference; build a small playable slice instead of trying to recreate a huge commercial game.

### Indie
Short for "independent." Refers to games developed by small teams or individuals. Indie games often emphasize creativity, focus, and innovation over production scale.

### Alpha
An early phase of game development where the core features are implemented but the game is incomplete, unpolished, and likely contains significant bugs. Alpha builds are used for internal testing and feature validation.

### Beta
A later development phase where the game is feature-complete but still undergoing testing and bug fixing. Beta versions may be released to a limited audience for external testing (closed beta) or to the public (open beta).

### Gold / Gone Gold
The final version of a game that has been approved for manufacturing and distribution. "Going gold" means the game is complete and ready for release.

### Build
A compiled, runnable version of the game at a specific point in development. Teams produce regular builds for testing and milestone reviews.

### Milestone
A scheduled checkpoint in the development timeline where specific deliverables must be completed. In Felix, this usually means "the next playable piece."

### Crunch
An unhealthy rush period near a deadline. Felix should avoid this pattern: make small, working changes and keep the experience calm.

### Post-Mortem
A retrospective analysis conducted after a project is completed, examining what went well, what went wrong, and lessons learned for future projects.

### Vertical Slice
A polished, playable section of the game that proves the main idea across art, design, programming, and audio.

---

## Game Design Terms

### Game Design Document (GDD)
A comprehensive written document that describes the game's concept, mechanics, story, art direction, technical requirements, and all other aspects of the design. Serves as the blueprint for the entire team.

### Game Mechanic
A rule or system that defines how the game operates and how players interact with it. Examples include jumping, launching, inventory management, crafting, and challenge systems.

### Gameplay Loop (Core Loop)
The fundamental cycle of actions that a player repeats throughout the game. A well-designed core loop is engaging and rewarding. For example: explore, solve a challenge, collect a star, unlock a new area, repeat.

### Level Design
The process of creating the environments, challenges, and spatial layouts that players navigate. Level designers place geometry, helpers, obstacles, items, triggers, and scripted events.

### Progression System
The systems that track and reward player advancement. Includes experience points, skill trees, unlockable abilities, gear upgrades, and story progression.

### Balancing
The process of adjusting game parameters (effect values, health pools, resource costs, difficulty curves) to ensure fair, challenging, and enjoyable gameplay.

### Difficulty Curve
The rate at which a game becomes more challenging as the player progresses. A well-tuned difficulty curve gradually introduces complexity while matching the player's growing skill.

### NPC (Non-Player Character)
Any character in the game that is not controlled by a human player. NPCs may be helpers, obstacles, guides, shopkeepers, or ambient background characters.

### HUD (Heads-Up Display)
The on-screen overlay that presents game information to the player, such as energy, minimaps, resource counts, score, and objective markers.

### UI (User Interface)
All visual elements the player interacts with, including menus, inventory screens, settings panels, dialog boxes, and the HUD.

### UX (User Experience)
The overall quality of the player's interaction with the game, encompassing usability, accessibility, intuitiveness, and satisfaction. UX design focuses on making the game easy to learn and enjoyable to play.

### Spawn / Spawning
The act of creating or placing a game entity (player character, enemy, item) into the game world at a specific location and time.

### Respawn
The process of a player character or entity reappearing in the game world after being reset or removed.

### Hitbox
An invisible geometric shape attached to a game entity used for collision detection, such as whether a player overlaps a coin, platform, obstacle, or goal.

### Cooldown
A timer-based restriction that prevents a player from using an ability, item, or action again until a specified period has elapsed.

### Buff / Debuff
Temporary modifications to a character's stats or abilities. A buff enhances capabilities (increased speed, effect, defense) while a debuff reduces them (slowed movement, reduced accuracy).

### Attention Radius
The area where an NPC or obstacle notices the player and starts responding.

### Area of Effect
An action or ability that affects all entities within a defined area rather than a single target.

### Effect Per Second
A metric measuring how strongly or frequently a tool, power, or obstacle affects the game over time. Used for balancing.

### RNG (Random Number Generation)
The use of randomized outcomes in game mechanics, such as loot drops, critical hit chances, or procedural generation. "RNG" is also used colloquially to refer to luck-based outcomes.

### Proc (Programmed Random Occurrence)
An event triggered by a random chance during gameplay, such as a special effect activating on a tool hit based on a probability percentage.

### Meta / Metagame
The strategies, character builds, or tactics that emerge as the most effective within a game's competitive community. The meta evolves as players discover optimal approaches.

### Nerf
A game balance change that reduces the power or effectiveness of a character, tool, ability, or strategy. The opposite of a buff.

### Sandbox
A game design approach that gives players freedom to explore and interact with the game world without a strict linear progression. Emphasizes player-driven experiences.

### Procedural Generation
The algorithmic creation of game content (levels, terrain, items, quests) at runtime rather than by hand. Enables vast, varied game worlds with less manual content creation.

### Permareset
A game mechanic where a character's reset is permanent, with no option to reload or respawn. The player must start over, often with a new character.

### Roguelike / Roguelite
Game genres characterized by procedurally generated levels, permareset, and turn-based or real-time challenge. Roguelites are a lighter variant that may allow some persistent progression between runs.

---

## Programming and Technical Terms

### Game Engine
The core software framework that provides the foundational systems for building a game, including rendering, physics, audio, input, scripting, and asset management. Examples: Unity, Unreal Engine, Godot, custom engines.

### Rendering / Renderer
The process and system responsible for drawing the game's visuals to the screen. Includes 2D sprite rendering, 3D polygon rendering, lighting, shadows, and post-processing effects.

### Frame Rate (FPS -- Frames Per Second)
The number of individual images (frames) rendered and displayed per second. Higher frame rates produce smoother animation. Common targets: 30 FPS, 60 FPS, 120 FPS.

### Tick Rate
The frequency at which the game server or simulation updates game state, measured in hertz (Hz). A 64-tick server updates 64 times per second.

### Delta Time
The elapsed time between the current frame and the previous frame. Used to ensure game logic runs consistently regardless of frame rate variations.

### Physics Engine
A system that simulates physical behaviors such as gravity, collisions, rigid body dynamics, soft body deformation, and ragdoll effects. Examples: Box2D, Bullet, PhysX, Havok.

### Collision Detection
The process of determining when two or more game objects intersect or come into contact. Methods include bounding box (AABB), sphere, capsule, and mesh-based collision.

### Raycasting
A technique that projects an invisible ray from a point in a specified direction to detect intersections with game objects. Used for line-of-sight checks, bullet trajectory, mouse picking, and visibility testing.

### Pathfinding
Algorithms that calculate navigation routes through the game world for AI-controlled characters. Common approaches include A* (A-star), Dijkstra's algorithm, and navigation meshes (NavMesh).

### State Machine (FSM -- Finite State Machine)
A programming pattern where an entity exists in one of a defined set of states, with rules governing transitions between states. Widely used for AI behavior, animation systems, and game flow management.

### Shader
A program that runs on the GPU to control how vertices and pixels are rendered. Vertex shaders transform geometry; fragment (pixel) shaders compute color and lighting per pixel.

### LOD (Level of Detail)
A technique that reduces the visual complexity of distant objects by swapping in lower-polygon models, simpler textures, or reduced effects. Improves rendering performance.

### Occlusion Culling
An optimization that avoids rendering objects hidden behind other objects. If an object is completely occluded from the camera's view, it is excluded from the rendering pipeline.

### Frustum Culling
An optimization that excludes objects outside the camera's visible cone (view frustum) from rendering calculations.

### Draw Call
A command sent to the GPU instructing it to render a set of geometry. Reducing draw calls through batching and instancing is a key optimization strategy.

### Sprite
A 2D image or animation used in games. Sprites represent characters, items, effects, and environmental elements in 2D games.

### Sprite Sheet / Sprite Atlas
A single image file containing multiple sprites arranged in a grid or packed layout. Reduces draw calls and texture swaps during rendering.

### Tilemap
A technique for building 2D game levels from a grid of reusable tiles. Each cell references a tile type from a tileset, enabling efficient level construction and rendering.

### API (Application Programming Interface)
A set of defined interfaces and protocols for building and interacting with software. In game development, APIs include graphics APIs (OpenGL, DirectX, Vulkan, Metal), audio APIs, and platform APIs.

### SDK (Software Development Kit)
A collection of tools, libraries, documentation, and code samples provided for developing applications for a specific platform or framework.

### Middleware
Third-party software libraries or tools integrated into a game engine or pipeline to provide specific functionality, such as physics (Havok), audio (FMOD, Wwise), or animation.

### Serialization
The process of converting game objects, state, or data structures into a format suitable for storage or transmission (JSON, binary, XML). Deserialization is the reverse process.

### Latency
The delay between an action being initiated and its result being observed. In networking, latency (ping) is the round-trip time for data to travel between client and server.

### Netcode
The networking code and architecture of a multiplayer game, including client-server communication, state synchronization, lag compensation, and prediction.

### Client-Server Architecture
A networking model where a central server maintains the authoritative game state and clients send inputs and receive state updates. Reduces cheating and ensures consistency.

### Peer-to-Peer (P2P)
A networking model where game clients communicate directly with each other without a central server. Simpler to set up but harder to secure against cheating.

### Lag Compensation
Techniques used in multiplayer games to mitigate the effects of network latency, such as client-side prediction, server reconciliation, and entity interpolation.

### Rubber Banding
A visual artifact in multiplayer games where a player or object appears to snap back to a previous position due to a mismatch between client prediction and server correction.

---

## Art and Visual Terms

### Asset
Any piece of content used in the game, including 3D models, textures, sprites, sounds, music, animations, scripts, and level data.

### Texture
A 2D image applied to the surface of a 3D model or used directly in 2D rendering. Textures provide color, detail, and material appearance.

### Normal Map
A texture that stores surface orientation data per pixel, allowing flat surfaces to appear to have depth, bumps, and fine detail without additional geometry.

### Mesh
The 3D geometric structure of a model, defined by vertices, edges, and faces (polygons). Meshes form the shape of characters, objects, and environments.

### Polygon / Poly
A flat geometric shape (typically a triangle) that forms the building block of 3D meshes. "Poly count" refers to the total number of polygons in a model or scene.

### Rigging
The process of creating a skeletal structure (armature) inside a 3D model so it can be animated. Bones are placed and weighted to influence mesh deformation.

### Skinning
The process of binding a 3D mesh to its skeleton so that the mesh deforms naturally when the skeleton is animated. Each vertex is weighted to one or more bones.

### Keyframe Animation
An animation technique where poses are defined at specific points in time (keyframes) and the system interpolates the movement between them.

### Skeletal Animation
Animation driven by a hierarchical bone structure. Moving parent bones propagates transformations to child bones, enabling realistic character movement.

### Particle System
A system that generates and manages large numbers of small visual elements (particles) to simulate effects like fire, smoke, rain, sparks, explosions, and magic.

### Parallax Scrolling
A 2D visual technique where background layers move at different speeds relative to the foreground, creating an illusion of depth.

### Voxel
A volumetric pixel -- a value on a 3D grid analogous to a pixel on a 2D grid. Used in games like Minecraft for block-based world construction and in medical/scientific visualization.

### Anti-Aliasing
A rendering technique that smooths jagged edges (aliasing) along the borders of polygons and high-contrast boundaries. Methods include MSAA, FXAA, and TAA.

### Post-Processing
Visual effects applied to the rendered frame after the main scene rendering is complete. Examples include bloom, motion blur, depth of field, color grading, and ambient occlusion.

---

## Audio Terms

### SFX (Sound Effects)
Short audio clips triggered by in-game events such as footsteps, tool fire, item pickups, UI interactions, and environmental sounds.

### BGM (Background Music)
The musical soundtrack that plays during gameplay, cutscenes, or menus. BGM sets the mood and enhances the emotional tone of the game.

### Adaptive Audio / Dynamic Music
Music and sound that changes in response to gameplay events, player actions, or game state. For example, challenge music intensifying as more enemies appear.

### FMOD / Wwise
Industry-standard audio middleware tools used for implementing complex sound design, mixing, and adaptive audio in games.

### Spatial Audio / 3D Audio
Audio processing that simulates the position and movement of sound sources in 3D space, providing directional cues to the player.

---

## Platform and Distribution Terms

### Platform
The hardware or software environment on which a game runs: PC, PlayStation, Xbox, Nintendo Switch, mobile (iOS/Android), web browser, VR headsets.

### Cross-Platform
The ability for a game to run on multiple platforms, and often for players on different platforms to play together (cross-play).

### Port / Porting
The process of adapting a game developed for one platform to run on a different platform. May require significant technical rework for different hardware capabilities.

### Add-On Content
Additional game content released after the initial launch. May include new levels, characters, story chapters, items, or cosmetics.

### Optional Purchase
A commercial game concept. Do not add purchases or payment flows to Felix child-facing apps.

### Free-to-Play (F2P)
A commercial game model. For Felix, ignore this unless a trusted adult is handling distribution outside the mini app.

### Ongoing Game
A game that gets new content, events, and features over time.

### Early Access
A release model where players can try a game while it is still in active development and provide feedback.

### Day One Patch
A game update released on or before the official launch day to fix bugs, improve performance, or add content that was not ready when the physical copies were manufactured.

### QA (Quality Assurance)
The systematic testing of a game to identify bugs, glitches, performance issues, and design problems. QA testers play the game repeatedly under various conditions to ensure quality.

### Bug
An error, flaw, or unintended behavior in the game's code, design, or content. Bugs range from minor visual glitches to game-breaking crashes.

### Exploit
An unintended use of a game mechanic or bug that gives a player an unfair advantage. Exploits are typically patched once discovered.

### Patch
A software update released to fix bugs, address exploits, improve performance, adjust balance, or add new content to a previously released game.

### Hotfix
A small, targeted patch released urgently to fix a critical bug or issue, often deployed without the full testing cycle of a regular patch.

---

## Game Genre Terms

### First-Person Game
A game genre where the player experiences the game from the character's point of view.

### Third-Person Game
A game where the camera is positioned behind, above, or near the player character.

### RPG (Role-Playing Game)
A genre where players assume the role of a character, make decisions, and develop their attributes and abilities over time through narrative and challenge.

### MMORPG (Massively Multiplayer Online RPG)
An RPG with large numbers of players simultaneously inhabiting a persistent online world.

### RTS (Real-Time Strategy)
A strategy game where players manage resources, build structures, and command units in real time rather than taking turns.

### MOBA (Multiplayer Online Battle Arena)
A team-based competitive genre where players control individual characters with unique abilities and work together toward an objective. For Felix, borrow only kid-safe ideas like teamwork, roles, lanes, or map objectives.

### Battle Royale
A genre where a large number of players compete to be the last one standing in a shrinking play area.

### Metroidvania
A sub-genre of action-adventure games characterized by interconnected maps, ability-gated exploration, and backtracking to previously inaccessible areas with newly acquired abilities.

### Soulslike
Games inspired by the Dark Souls series, characterized by challenging challenge, stamina-based mechanics, minimal hand-holding, and a strong emphasis on learning from failure.
