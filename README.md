# Vturb Seeker

A Chrome extension that bypasses the fake, non-interactive progress bars used on Converteai/Vturb video sales letters (VSLs) — letting you seek to any point in the video instantly.

## The Problem

Many VSL pages built with [Converteai](https://converteai.net) / Vturb display a fake progress bar that looks like a video scrubber but is actually just a visual overlay. Clicking or dragging it does nothing — you're forced to watch from wherever the video is.

This extension injects a real seek control directly into the page.

## Features

- **Slider** — drag to scrub anywhere in the video
- **Timestamp input** — type `5:30` or `330` (seconds) and hit Enter or Go
- **Auto-detects** the player — appears automatically once the video loads
- **Draggable bar** — reposition it anywhere on screen
- **Works on any Vturb/Converteai VSL** — not just one specific site

## Installation

This extension is not on the Chrome Web Store. Install it in developer mode:

1. [Download or clone this repo](https://github.com/Concept-Affiliates/vturb-seeker)
2. Open Chrome and go to `chrome://extensions`
3. Toggle **Developer mode** ON (switch in the top-right corner)
4. Click **Load unpacked**
5. Select the `vturb-seeker` folder

The extension icon will appear in your toolbar. No configuration needed.

## Usage

1. Visit any Vturb/Converteai VSL page
2. Wait for the video to start loading (~5–10 seconds)
3. The **Vturb Seeker** bar will appear at the bottom of the screen automatically
4. Use the slider or type a timestamp to jump to any point
5. Hit **✕** to dismiss the bar

### Timestamp formats

| Input | Jumps to |
|-------|----------|
| `330` | 5 minutes 30 seconds |
| `5:30` | 5 minutes 30 seconds |
| `1:05:00` | 1 hour 5 minutes |

## Updating

To get the latest version:

```bash
cd vturb-seeker
git pull
```

Then go to `chrome://extensions` and click the **reload** button on the extension.

## How It Works

Vturb's smartplayer exposes a `window.smartplayer` global with a `seek()` method on each player instance. The fake progress bar is just a CSS overlay that intercepts clicks — the real video underneath is fully seekable. This extension runs in the page's main JavaScript context, waits for the player to initialise, and injects a seek UI that calls `seek()` directly.
