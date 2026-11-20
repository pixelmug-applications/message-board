# Message Board

Message Board is a complete PixelMug Bot + MPY application. Chat messages are sent to a bound PixelMug and displayed on its 32×16 screen through the firmware `pushMessage` RPC.

## Display

The upper row shows the previous message; the lower row shows the newest one in a brighter color. New messages start typing from the horizontal center. Text moves left when it reaches the right edge. When the next message starts, the previous one slides up.

After typing, the display holds for three seconds. Long messages then scroll independently on each row; short messages stay centered. The upper row pauses while a new message is being typed. New arrivals interrupt idle scrolling and play in order, after any current typing and hold finish.

The device keeps only the two displayed messages and up to eight waiting messages in memory. If the waiting queue fills, the oldest waiting message is dropped. Restarting or `/clear` clears everything; no messages are written to storage.

The existing small font supports printable ASCII. Chinese, emoji, and other unsupported characters display as `?`; full Chinese text requires an additional font.

## Commands

- `/bindDevice` — bind a PixelMug S1.
- `/install` — install and start the MPS configured by PixelMug Studio.
- `/clear` — clear the device display.
- Other text — send it to the device. Unknown slash commands show command help instead.

In groups, mentions of this Bot are removed from the displayed text, including Chinese Bot names. Commands accept both `@Bot /install` and `@Bot/install`, as well as `/install@Bot`. A mention with no message sends nothing. Email addresses and mentions of other people are preserved. Studio/SDK group mention rules remain unchanged.

Run `/install` after binding the device. The MPS then receives messages through the built-in `mpy_message` module.

## Project layout

- `bot/` — Bubble Bot and device RPC handling.
- `mpy/` — MicroPython message-board application.

Studio supplies `BOT_TOKEN`, `BOT_API_BASE_URL`, `STUDIO_MPS_ID`, and `STUDIO_MPS_VERSION` when the Bot runs. Install dependencies with `npm install`, then start the Bot with `npm run bot`.
