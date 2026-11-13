"""Generate the square-module star icons (192 and 512 px). No dependencies."""
import struct, zlib, sys, os

BG, INK, DIM = (7, 8, 12), (244, 241, 230), (201, 195, 173)
N = 9  # 9x9 modules

def star():
    cells = {}
    for k in range(-3, 4):
        cells[(4 + k, 4)] = DIM
        cells[(4, 4 + k)] = DIM
    for dx in (-1, 1):
        for dy in (-1, 1):
            cells[(4 + dx, 4 + dy)] = DIM
    cells[(4, 4)] = INK
    return cells

def png(size, path):
    cells = star()
    m = size // N
    off = (size - m * N) // 2
    gap = max(1, m // 8)
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            c = BG
            gx, gy = (x - off) // m, (y - off) // m
            if 0 <= gx < N and 0 <= gy < N and (gx, gy) in cells:
                if (x - off) % m >= gap and (y - off) % m >= gap:
                    c = cells[(gx, gy)]
            row += bytes(c)
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(data)

here = os.path.dirname(os.path.abspath(__file__))
for s in (192, 512):
    png(s, os.path.join(here, f"icon-{s}.png"))
