"""生成扩展图标：蓝色圆角方块 + 白色 S，3x3 超采样抗锯齿，无第三方依赖。"""
import os
import struct
import zlib

BG = (74, 126, 222)      # #4A7EDE
FG = (255, 255, 255)

# S 字母由 5 个矩形拼成（相对坐标）
S_PARTS = [
    (0.28, 0.22, 0.72, 0.30),  # 上横
    (0.28, 0.30, 0.38, 0.50),  # 左上竖
    (0.28, 0.48, 0.72, 0.56),  # 中横
    (0.62, 0.56, 0.72, 0.76),  # 右下竖
    (0.28, 0.70, 0.72, 0.78),  # 下横
]


def inside_round_rect(px, py, n, radius):
    nx = min(max(px, radius), n - radius)
    ny = min(max(py, radius), n - radius)
    return (px - nx) ** 2 + (py - ny) ** 2 <= radius * radius


def in_letter(px, py, n):
    u, v = px / n, py / n
    return any(x0 <= u <= x1 and y0 <= v <= y1 for x0, y0, x1, y1 in S_PARTS)


def render(n):
    """返回 n*n 像素的 RGBA 字节。"""
    radius = 0.18 * n
    sub = [(i / 3.0 + 1 / 6.0, j / 3.0 + 1 / 6.0) for i in range(3) for j in range(3)]
    rows = []
    for y in range(n):
        row = bytearray([0])  # PNG filter: none
        for x in range(n):
            acc_a = acc_r = acc_g = acc_b = 0.0
            for dx, dy in sub:
                sx, sy = x + dx, y + dy
                if in_letter(sx, sy, n):
                    r, g, b, a = *FG, 1.0
                elif inside_round_rect(sx, sy, n, radius):
                    r, g, b, a = *BG, 1.0
                else:
                    r = g = b = a = 0.0
                acc_r += r * a
                acc_g += g * a
                acc_b += b * a
                acc_a += a
            if acc_a > 0:
                row += bytes(round(c / acc_a) for c in (acc_r, acc_g, acc_b)) + bytes([round(acc_a / 9 * 255)])
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return b''.join(rows)


def write_png(path, n):
    raw = render(n)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', zlib.compress(raw, 9)) +
           chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
    os.makedirs(out, exist_ok=True)
    for n in (16, 32, 48, 128):
        write_png(os.path.join(out, f'icon{n}.png'), n)
        print(f'icon{n}.png ok')


if __name__ == '__main__':
    main()
