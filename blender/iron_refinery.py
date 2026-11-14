"""Iron Refinery — 6×6 cells. Ore silo + screw feeder into a furnace hall with a glowing
tap hole, a tall stack with platform, a gas scrubber, and stacked ingots under a gantry crane."""
import math
from mathutils import Vector

begin('iron_refinery')
M = library()
INGOT = mat('iron_ingot', '#c3ccd6', 0.95, 0.3)
HOT = mat('molten', '#2a0a00', 0.0, 0.6, emit='#ff6a1a', strength=9.0)

box(M['pad'], 6, 6, 0.71, 0, 0, -0.65, bev=0.05)
box(M['concrete'], 5.7, 5.7, 0.02, 0, 0, 0.06, bev=0)
for i in range(10):   # scorch marks / drain grate near the furnace
    box(M['dark'], 0.5, 0.04, 0.01, -0.6, 0.0 - i * 0.06, 0.08, bev=0)

# --- Furnace hall ---------------------------------------------------------------------------
hx, hy, hw, hd, hh = -0.85, 0.75, 2.9, 2.4, 1.6
box(M['concrete'], hw + 0.2, hd + 0.2, 0.12, hx, hy, 0.06, bev=0.02)
box(M['dark'], hw, hd, hh, hx, hy, 0.18, bev=0.03)
for (w, x, y, rz) in ((hw - 0.3, hx, hy - hd / 2 - 0.005, 0), (hw - 0.3, hx, hy + hd / 2 + 0.005, math.pi),
                      (hd - 0.3, hx - hw / 2 - 0.005, hy, -math.pi / 2), (hd - 0.3, hx + hw / 2 + 0.005, hy, math.pi / 2)):
    corrugated(M['dark'], w, hh - 0.3, x, y, 0.3, rz=rz, pitch=0.12, depth=0.035)
for sx in (-1, 1):
    for sy in (-1, 1):
        box(M['metal'], 0.14, 0.14, hh + 0.05, hx + sx * hw / 2, hy + sy * hd / 2, 0.18, bev=0.02)
box(M['orange'], hw + 0.1, hd + 0.1, 0.18, hx, hy, 0.18 + hh - 0.06, bev=0.02)
roof = 0.18 + hh + 0.12
# monitor roof with louvres
box(M['metal'], hw - 0.3, hd - 0.3, 0.05, hx, hy, roof, bev=0.01)
box(M['dark'], 1.6, 0.8, 0.35, hx, hy, roof + 0.05, bev=0.02)
grille(M['metal'], 1.4, 0.3, hx, hy - 0.41, roof + 0.07, slats=4)
grille(M['metal'], 1.4, 0.3, hx, hy + 0.41, roof + 0.07, rz=math.pi, slats=4)
box(M['orange'], 1.7, 0.9, 0.06, hx, hy, roof + 0.4, bev=0.02)
# tap hole: glowing opening with a hood and a ladle on rails
fx = hx + 0.3
box(M['metal'], 0.9, 0.12, 0.8, fx, hy - hd / 2 - 0.05, 0.18, bev=0.02)
box(HOT, 0.55, 0.06, 0.45, fx, hy - hd / 2 - 0.11, 0.25, bev=0.02)
o = box(M['dark'], 1.0, 0.45, 0.08, fx, hy - hd / 2 - 0.25, 1.05, rx=-0.35, bev=0.02)
box(M['glow_orange'], 0.2, 0.02, 0.06, fx - 0.55, hy - hd / 2 - 0.06, 0.9, bev=0)
# runner channel + ladle car
box(M['concrete'], 0.25, 0.7, 0.06, fx, hy - hd / 2 - 0.45, 0.06, bev=0.01)
box(HOT, 0.12, 0.55, 0.01, fx, hy - hd / 2 - 0.45, 0.12, bev=0)
for dx in (-0.25, 0.25):
    box(M['metal'], 0.04, 1.6, 0.03, fx + dx, -1.2, 0.07, bev=0)
lathe(M['dark'], [(0.0, 0.0), (0.22, 0.0), (0.3, 0.38), (0.33, 0.4), (0.0, 0.4)], fx, -1.0, 0.18, seg=24, name='ladle')
cyl(HOT, 0.27, 0.01, fx, -1.0, 0.56, 24)
box(M['yellow'], 0.6, 0.5, 0.1, fx, -1.0, 0.08, bev=0.02)
for dx in (-0.22, 0.22):
    for dy in (-0.18, 0.18):
        o = cyl(M['black'], 0.06, 0.05, name='wheel'); o.rotation_euler = (0, math.pi / 2, 0); o.location = (fx + dx, -1.0 + dy, 0.1)
# personnel door + windows
box(M['panel'], 0.45, 0.04, 0.85, hx - 1.0, hy - hd / 2 - 0.03, 0.18, bev=0.01)
box(M['glow_white'], 0.4, 0.04, 0.03, hx - 1.0, hy - hd / 2 - 0.05, 1.1, bev=0)
for k in range(2):
    box(M['warm_window'], 0.35, 0.03, 0.2, hx - 0.25 + k * 0.0, hy - hd / 2 - 0.03, 1.25, bev=0)

# --- Stack -----------------------------------------------------------------------------------
sx, sy = -1.95, 1.55
cyl(M['concrete'], 0.5, 0.25, sx, sy, roof - 0.2, 24, bev=0.02)
cyl(M['offwhite'], 0.36, 2.55, sx, sy, roof, 32, r2=0.28)
for j in range(5):
    torus(M['red'] if j in (3, 4) else M['metal'], 0.355 - j * 0.016, 0.03, sx, sy, roof + 0.35 + j * 0.48, seg=32, rseg=5)
top = roof + 2.55
cyl(M['dark'], 0.32, 0.18, sx, sy, top, 32)
cyl(HOT, 0.25, 0.02, sx, sy, top + 0.17, 24)
# platform with railing
ring(M['metal'], 0.3, 0.68, 0.04, sx, sy, roof + 1.6, 32)
for a, x, y in polar(6, 0.62):
    strut(M['metal'], (sx + x, sy + y, roof + 1.6), (sx + x * 0.5, sy + y * 0.5, roof + 1.2), 0.015, 4, 'bracket')
pts = [(sx + math.cos(a) * 0.66, sy + math.sin(a) * 0.66, roof + 1.64) for a in [TAU * i / 16 for i in range(17)]]
railing(M['yellow'], pts, h=0.35, post_every=0.6, r=0.011)
ladder(M['alu'], sx + 0.42, sy, roof, 1.65, rz=math.pi / 2, w=0.24)
# aircraft warning lights
for a, x, y in polar(3, 0.33):
    sphere(M['glow_red'], 0.035, sx + x, sy + y, top + 0.1, 8, 6)

# --- Ore silo + screw feeder (east) ----------------------------------------------------------
ox, oy = 1.85, 1.35
for a, x, y in polar(4, 0.55, math.pi / 4):
    strut(M['metal'], (ox + x, oy + y, 0.06), (ox + x * 0.95, oy + y * 0.95, 1.15), 0.045, 8, 'silo_leg')
    cyl(M['concrete'], 0.1, 0.06, ox + x, oy + y, 0.06, 10)
for a, x, y in polar(4, 0.55, math.pi / 4):
    x2, y2 = math.cos(a + math.pi / 2) * 0.55, math.sin(a + math.pi / 2) * 0.55
    strut(M['metal'], (ox + x, oy + y, 0.2), (ox + x2, oy + y2, 0.95), 0.015, 5, 'silo_brace')
lathe(M['white'], [(0.08, 0.0), (0.12, 0.05), (0.7, 0.6), (0.7, 2.15), (0.6, 2.35), (0.0, 2.42)], ox, oy, 0.6, seg=40, name='silo')
for j in range(4):
    torus(M['orange'] if j == 3 else M['metal'], 0.705, 0.02, ox, oy, 1.4 + j * 0.42, seg=40, rseg=5)
ladder(M['alu'], ox + 0.71, oy, 1.2, 1.65, rz=math.pi / 2, w=0.22)
cyl(M['dark'], 0.12, 0.12, ox, oy, 3.0, 12)
# rotary valve + screw conveyor (inclined tube) into the hall
cyl(M['dark'], 0.12, 0.25, ox, oy, 0.35, 12)
a = Vector((ox, oy, 0.4))
b = Vector((hx + hw / 2 - 0.1, hy + 0.3, 1.45))
strut(M['offwhite'], a, b, 0.09, 16, 'screw_tube')
for t in (0.25, 0.5, 0.75):
    p = a + (b - a) * t
    torus(M['metal'], 0.095, 0.015, *p, rot=(0, math.pi / 2 - math.atan2((b - a).z, (b - a).xy.length), math.atan2((b - a).y, (b - a).x)), seg=16, rseg=4)
    strut(M['metal'], (p.x, p.y, 0.06), p, 0.025, 6, 'screw_support')
box(M['dark'], 0.3, 0.25, 0.25, a.x - 0.0, a.y - 0.3, 0.06, bev=0.02)

# --- Gas scrubber ------------------------------------------------------------------------------
gx, gy = 1.95, -0.25
cyl(M['concrete'], 0.4, 0.08, gx, gy, 0.06, 20)
cyl(M['teal'], 0.3, 1.5, gx, gy, 0.14, 28)
dome(M['teal'], 0.3, gx, gy, 1.64, seg=28, rings=5, sz=0.5)
for j in range(3):
    torus(M['metal'], 0.305, 0.015, gx, gy, 0.45 + j * 0.45, seg=28, rseg=4)
pipe(M['metal'], [(hx + hw / 2, hy - 0.6, 1.5), (gx, hy - 0.6, 1.5), (gx, gy, 1.75)], 0.06)
flange(M['metal'], 0.1, gx - 0.6, hy - 0.6, 1.5, rot=(0, math.pi / 2, 0), bolts=8, bolt_m=M['dark'])
pipe(M['metal'], [(gx + 0.3, gy, 0.4), (gx + 0.55, gy, 0.4), (gx + 0.55, gy, 0.08)], 0.04)

# --- Ingot yard with gantry crane (south) ---------------------------------------------------------
iy0 = -2.0
for p, px in enumerate((0.75, 1.75)):
    box(M['dark'], 0.8, 0.7, 0.08, px, iy0, 0.06, bev=0.01)
    for layer in range(4):
        along_x = layer % 2 == 0
        for k in range(3):
            if along_x:
                box(INGOT, 0.7, 0.18, 0.1, px, iy0 - 0.22 + k * 0.22, 0.14 + layer * 0.1, bev=0.025)
            else:
                box(INGOT, 0.18, 0.62, 0.1, px - 0.24 + k * 0.24, iy0, 0.14 + layer * 0.1, bev=0.025)
for gx_ in (0.25, 2.25):
    for gy_ in (-2.6, -1.4):
        box(M['yellow'], 0.08, 0.08, 1.4, gx_, gy_, 0.06, bev=0.01)
    box(M['yellow'], 0.08, 1.3, 0.1, gx_, -2.0, 1.42, bev=0.01)
box(M['yellow'], 2.15, 0.12, 0.14, 1.25, -2.0, 1.52, bev=0.02)
box(M['dark'], 0.25, 0.22, 0.18, 1.4, -2.0, 1.35, bev=0.02)
strut(M['metal'], (1.4, -2.0, 1.35), (1.4, -2.0, 0.85), 0.008, 4, 'hoist')
box(M['metal'], 0.22, 0.05, 0.05, 1.4, -2.0, 0.8, bev=0)
box(M['glow_orange'], 0.06, 0.03, 0.03, 1.4, -2.12, 1.4, bev=0)

result = finish()
