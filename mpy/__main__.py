import micropyxel as pyxel
import mpy_message


DISPLAY_WIDTH = 32
DISPLAY_HEIGHT = 16
FONT_WIDTH = 4
FONT_HEIGHT = 7
BACKGROUND_COLOR = 0
TEXT_COLOR = 7
FPS = 30
BLINK_PHASE_FRAMES = max(1, FPS // 6)


class MessageBoard:
    def __init__(self):
        self.message = ""
        self.pending_message = None
        self.blink_frame = 0

        pyxel.init()
        mpy_message.onMessage(self.on_message)
        pyxel.run(self.update, self.draw, fps=FPS, on_exit=self.on_exit)

    def on_message(self, message):
        if message == "/clear":
            self.message = ""
            self.pending_message = None
            self.blink_frame = 0
            return

        self.pending_message = str(message)
        self.blink_frame = 0

    def update(self, runtime):
        if self.pending_message is None:
            return

        self.blink_frame += 1
        if self.blink_frame >= BLINK_PHASE_FRAMES * 4:
            self.message = self.pending_message
            self.pending_message = None
            self.blink_frame = 0

    def draw(self, runtime):
        pyxel.cls(BACKGROUND_COLOR)
        if self.pending_message is not None:
            phase = self.blink_frame // BLINK_PHASE_FRAMES
            if phase % 2 == 1:
                return

        if not self.message:
            return

        self.draw_message(self.message)

    def draw_message(self, message):
        text_width = len(message) * FONT_WIDTH
        x = (DISPLAY_WIDTH - text_width) // 2
        y = (DISPLAY_HEIGHT - FONT_HEIGHT) // 2
        pyxel.text(x, y, message, TEXT_COLOR)

    def on_exit(self, runtime, reason, exc):
        mpy_message.onMessage(None)
        pyxel.destroy()


MessageBoard()
