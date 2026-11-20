import micropyxel as pyxel
import mpy_message


DISPLAY_WIDTH = 32
ROW_HEIGHT = 8
FONT_WIDTH = 4
FPS = 30
TYPE_FRAMES = 4
HOLD_FRAMES = FPS * 3
SCROLL_FRAMES = 3
SCROLL_GAP = 12
MAX_PENDING = 8
TOP_COLOR = 6
BOTTOM_COLOR = 7


class MessageRow:
    def __init__(self, text):
        self.text = text
        self.width = len(text) * FONT_WIDTH
        self.visible = 0
        self.x = DISPLAY_WIDTH // 2

    def step_position(self, center=False):
        target = min(DISPLAY_WIDTH // 2, DISPLAY_WIDTH - self.visible * FONT_WIDTH)
        if center and self.width <= DISPLAY_WIDTH:
            target = (DISPLAY_WIDTH - self.width) // 2
        if self.x < target:
            self.x += 1
        elif self.x > target:
            self.x -= 1

    def scroll(self):
        if self.width <= DISPLAY_WIDTH:
            self.x = (DISPLAY_WIDTH - self.width) // 2
        else:
            self.x -= 1
            if self.x <= -(self.width + SCROLL_GAP):
                self.x += self.width + SCROLL_GAP

    def draw(self, y, color, repeat=False):
        text = self.text[:self.visible]
        pyxel.text(self.x, y, text, color)
        if repeat and self.width > DISPLAY_WIDTH:
            pyxel.text(self.x + self.width + SCROLL_GAP, y, text, color)


class MessageBoard:
    def __init__(self):
        self.clear()
        pyxel.init()
        mpy_message.onMessage(self.on_message)
        pyxel.run(self.update, self.draw, fps=FPS, on_exit=self.on_exit)

    def clear(self):
        self.top = None
        self.bottom = None
        self.outgoing = None
        self.pending = []
        self.phase = "idle"
        self.frame = 0
        self.slide = 0

    def on_message(self, message):
        if message == "/clear":
            self.clear()
            return
        # The built-in 4x6 font supports printable ASCII. Use one visible
        # placeholder per unsupported character so text width remains correct.
        text = " ".join(str(message).split())[:256]
        text = "".join(c if 32 <= ord(c) < 127 else "?" for c in text)
        if not text:
            return
        if len(self.pending) >= MAX_PENDING:
            self.pending.pop(0)
            print("[message-board] Pending queue full; oldest waiting message dropped")
        self.pending.append(text)

    def start_next(self):
        message = self.pending.pop(0)
        self.outgoing = self.top
        self.top = self.bottom
        self.bottom = MessageRow(message)
        self.frame = 0
        self.slide = 0
        self.phase = "slide" if self.top is not None else "typing"

    def update(self, runtime):
        if self.phase == "slide":
            self.slide += 1
            if self.slide >= ROW_HEIGHT:
                self.outgoing = None
                self.phase = "typing"
                self.frame = 0
            return

        if self.phase == "typing":
            if self.frame % TYPE_FRAMES == 0:
                self.bottom.visible += 1
            self.bottom.step_position()
            self.frame += 1
            if self.bottom.visible == len(self.bottom.text):
                self.phase = "hold"
                self.frame = 0
            return

        if self.phase == "hold":
            self.bottom.step_position(center=True)
            self.frame += 1
            if self.frame >= HOLD_FRAMES:
                self.phase = "idle"
                self.frame = 0
            return

        if self.pending:
            self.start_next()
            return

        self.frame += 1
        if self.frame % SCROLL_FRAMES == 0:
            for row in (self.top, self.bottom):
                if row is not None:
                    row.scroll()

    def draw(self, runtime):
        pyxel.cls(0)
        if self.phase == "slide":
            if self.outgoing is not None:
                self.outgoing.draw(-self.slide + 1, TOP_COLOR, repeat=True)
            if self.top is not None:
                self.top.draw(ROW_HEIGHT - self.slide + 1, TOP_COLOR, repeat=True)
            return
        repeat = self.phase == "idle"
        if self.top is not None:
            self.top.draw(1, TOP_COLOR, repeat=True)
        if self.bottom is not None:
            self.bottom.draw(ROW_HEIGHT + 1, BOTTOM_COLOR, repeat)

    def on_exit(self, runtime, reason, exc):
        mpy_message.onMessage(None)
        pyxel.destroy()


MessageBoard()
