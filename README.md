# Dark Mind V1.1 — Camera Prototype

## Run on Windows
1. Install Node.js LTS if you do not already have it.
2. Open PowerShell in this folder.
3. Run `npm install`.
4. Run `npm run dev -- --host`.
5. Open the local address Vite shows.

For phone camera testing on the same Wi-Fi, Vite's `--host` option exposes the dev server on your local network. Some browsers require HTTPS for camera access when using a non-localhost address. If the browser blocks the camera, we can add HTTPS or use a secure deployment.

## What's new
- Real rear-camera preview via browser camera permission.
- Camera positioning guide.
- Tap-to-calibrate bull centre and 20 outer edge.
- Calibration confirmation.
- Celebration tones using Web Audio for calibration, 180 and checkout.
- Dark Mind hero imagery.
- LocalStorage fallback so the prototype works outside the original preview environment.

Automatic dart detection is the next major step; this version does not claim to detect darts from the camera yet.
