# Message Board

Message Board is a complete PixelMug Bot + MPY application. Chat messages are sent to a bound PixelMug and displayed on its 32×16 screen through the firmware `pushMessage` RPC.

## Commands

- `/bindDevice` — bind a PixelMug S1.
- `/install` — install and start the MPS configured by PixelMug Studio.
- `/clear` — clear the device display.
- Any other text — send it to the device.

Run `/install` after binding the device. The MPS then receives messages through the built-in `mpy_message` module.

## Project layout

- `bot/` — Bubble Bot and device RPC handling.
- `mpy/` — MicroPython message-board application.

Studio supplies `BOT_TOKEN`, `BOT_API_BASE_URL`, `STUDIO_MPS_ID`, and `STUDIO_MPS_VERSION` when the Bot runs. Install dependencies with `npm install`, then start the Bot with `npm run bot`.
