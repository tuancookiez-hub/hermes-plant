# Hermes Plant

A calm houseplant for Hermes Desktop. It sits above the app like the Hermes pet, takes no layout space, and grows slowly in real time over days and weeks.

![The plant from sapling to flowering](docs/images/stages.png)

You look after it with a small care wheel, and Hermes can look after it too when you ask. Pruning decides how it branches, so no two plants end up the same shape. If you forget it, it droops, leans or stops growing. It never dies, and it picks up again when you tend it.

## Using it

- **Click the plant** to open the care wheel. Hover an action to see what it does.
- **Drag the plant** anywhere in the window. It remembers where you put it.
- **Click the sprout in the status bar** to hide or show the plant. The sprout shows the plant's mood when something needs doing.
- With the wheel open, arrow keys move between actions, Enter picks one, and Esc closes it.

![The care wheel](docs/images/wheel.png)

| Action | What it does |
|---|---|
| Water | Three more days of growth. The plant gets thirsty in the last day. |
| Prune | Cuts the tallest tip. Two new shoots branch from the cut. |
| Rotate | Turns the pot. A plant leans toward the light over about ten days, and turning it lets it straighten. |
| Feed | Growth runs half again as fast for two days. |
| Repot | Moves it to a bigger pot once the roots have filled this one. |
| Ask Hermes | Sends one chat message asking how the plant is doing. |

## How it grows

- Growth counts only while the plant is watered. When it dries out it droops and waits.
- There are four stages: sapling, young plant (7 days of growth), mature plant (21 days) and flowering (45 days).
- Each pot holds only so much growth. A root-bound plant stops growing until you repot it, so each new stage starts with a bigger pot.
- A flowering plant blooms while it is watered. A thirsty one closes to buds.
- The plant's seed and your cuts decide its shape. The same history always draws the same plant.

Growth is worked out from saved timestamps whenever the plant is drawn. Nothing runs while Hermes is closed, and time away still counts.

## Hermes can tend it

| Tool | What it does |
|---|---|
| `plant_status` | Reports the stage, mood, what the plant needs, water left and whether it is growing |
| `plant_tend` | Waters, prunes, rotates, feeds or repots the plant, and reports what happened |

Try "how is my plant doing?" or "water my plant". The plant on screen follows within a moment. Hermes only tends the plant when you ask it to.

## Commands and keys

Every action is in the command palette under **Houseplant**, along with **open care wheel** and **show or hide**.

| Key | Action |
|---|---|
| `Ctrl+Alt+H` (`Cmd+Alt+H` on macOS) | Open the care wheel |
| `Ctrl+Alt+W` (`Cmd+Alt+W` on macOS) | Water |

The other actions have no default key. You can bind any of them in the keybind settings.

## The plant speaks through the pet

When a Hermes pet is on screen, the plant's lines appear in the pet's speech bubble. With no pet, they appear beside the plant, or in the status bar when the plant is hidden. It speaks when you tend it, when it starts to need something, and when it reaches a new stage.

## Install

Hermes Desktop is required.

```bash
hermes plugins install hermes-plant
```

Then enable **Houseplant** in **Capabilities → Plugins**. The plant appears straight away.

The agent tools need the Python half as well: add `hermes-plant` to `plugins.enabled` in `config.yaml`, restart the gateway, and start a new chat. Without that, the plant still works in Desktop and keeps its state there.

## Data, network and cost

- **Network:** none. The plugin makes no requests outside this machine.
- **Model calls:** none in the background. **Ask Hermes** sends one chat message when you press it, which reaches your model provider like anything you type. The two agent tools run only when Hermes calls them in a chat.
- **Background work:** no background processes. While Desktop is open, the plant redraws at most once a minute and checks its own backend for changes made by the agent tools.
- **Stored data:** the plant is kept in Hermes Desktop plugin storage, and in `plugin-data/hermes-plant/data.db` inside your Hermes home when the Python half is enabled. The two copies sync, and the one with the newer care action wins. Nothing is stored in the install folder.
- **Overlay:** Hermes has no plugin area for an element that floats above the app, so the plugin adds its own element to the page and removes it when the plugin is unloaded. It does not read or change Hermes's own interface. A future Hermes update could change how the overlay behaves.
- **Art:** all artwork is drawn by the plugin's own code as SVG. No images or fonts are bundled.
- **Motion:** the wheel, water drops and leaf sway are short CSS animations, and they are switched off when your system asks for reduced motion.

## Development

`desktop/plugin.js` is generated from `desktop-src/`. The plant's rules exist twice, in `desktop-src/src/engine.js` for Desktop and `plantcore/engine.py` for the agent tools, and `desktop-src/test/parity.json` keeps the two in step.

```bash
npm ci --prefix desktop-src
```

```bash
npm test --prefix desktop-src
```

```bash
npm run build --prefix desktop-src
```

```bash
python -m pytest
```

After changing a rule, change it in both engines and run `npm run parity --prefix desktop-src` to refresh the shared test data.

## License

MIT. See [LICENSE](LICENSE).
