"""Life-Support Plant — 6×6 cells. Water recycling hall, electrolysis skid (splits water
into oxygen + hydrogen), insulated water tanks, oxygen spheres and a pipe rack."""
import math
from mathutils import Vector

begin('life_support')
M = library()

box(M['pad'], 6, 6, 0.71, 0, 0, -0.65, bev=0.05)
box(M['concrete'], 5.7, 5.7, 0.02, 0, 0, 0.06, bev=0)
# painted walkway lines
for x in (-0.15, 0.15):
    box(M['yellow'], 0.04, 5.2, 0.005, x, -0.2, 0.08, bev=0)

# --- Processing hall (north-west) ----------------------------------------------------
hx, hy, hw, hd, hh = -1.35, 1.25, 2.9, 2.5, 1.45
box(M['concrete'], hw + 0.15, hd + 0.15, 0.1, hx, hy, 0.06, bev=0.02)
box(M['offwhite'], hw, hd, hh, hx, hy, 0.16, bev=0.03)
corrugated(M['offwhite'], hw - 0.3, hh - 0.25, hx, hy - hd / 2 - 0.005, 0.25, pitch=0.12, depth=0.03)
corrugated(M['offwhite'], hw - 0.3, hh - 0.25, hx, hy + hd / 2 + 0.005, 0.25, rz=math.pi, pitch=0.12, depth=0.03)
corrugated(M['offwhite'], hd - 0.3, hh - 0.25, hx - hw / 2 - 0.005, hy, 0.25, rz=-math.pi / 2, pitch=0.12, depth=0.03)
corrugated(M['offwhite'], hd - 0.3, hh - 0.25, hx + hw / 2 + 0.005, hy, 0.25, rz=math.pi / 2, pitch=0.12, depth=0.03)
# corner columns + teal fascia
for sx in (-1, 1):
    for sy in (-1, 1):
        box(M['panel'], 0.14, 0.14, hh, hx + sx * hw / 2, hy + sy * hd / 2, 0.16, bev=0.02)
box(M['teal'], hw + 0.08, hd + 0.08, 0.2, hx, hy, 0.16 + hh - 0.05, bev=0.02)
box(M['panel'], hw - 0.1, hd - 0.1, 0.06, hx, hy, 0.16 + hh + 0.12, bev=0.01)
roof = 0.16 + hh + 0.18
# roof HVAC units with spinning fans
for k, dx in enumerate((-0.7, 0.55)):
    box(M['panel'], 0.85, 0.85, 0.32, hx + dx, hy + 0.35, roof, bev=0.04)
    cyl(M['dark'], 0.33, 0.04, hx + dx, hy + 0.35, roof + 0.32, 28)
    fan(M['dark'], M['dark'], 0.3, hx + dx, hy + 0.35, roof + 0.3, blades=6, spin=8.0 + k * 2, name='spin_hvac%d' % k)
    torus(M['metal'], 0.33, 0.012, hx + dx, hy + 0.35, roof + 0.36, seg=28, rseg=4)
    for a, x, y in polar(4, 0.33, math.pi / 4):
        strut(M['metal'], (hx + dx + x, hy + 0.35 + y, roof + 0.36), (hx + dx - x, hy + 0.35 - y, roof + 0.36), 0.008, 4, 'guard')
    grille(M['dark'], 0.6, 0.22, hx + dx, hy + 0.35 - 0.43, roof + 0.04, slats=5)
# roof pipe + vent hood
pipe(M['metal'], [(hx - 1.1, hy - 0.7, roof), (hx - 1.1, hy - 0.7, roof + 0.25), (hx - 0.6, hy - 0.7, roof + 0.25)], 0.05)
cyl(M['dark'], 0.12, 0.08, hx - 0.6, hy - 0.7, roof + 0.2, 12, rot=(0, math.pi / 2, 0))
# south face: door, windows, sign
box(M['dark'], 0.75, 0.06, 1.05, hx + 0.6, hy - hd / 2 - 0.03, 0.16, bev=0.01)
box(M['panel'], 0.32, 0.04, 0.95, hx + 0.43, hy - hd / 2 - 0.06, 0.18, bev=0.01)
box(M['panel'], 0.32, 0.04, 0.95, hx + 0.77, hy - hd / 2 - 0.06, 0.18, bev=0.01)
box(M['glow_white'], 0.6, 0.05, 0.04, hx + 0.6, hy - hd / 2 - 0.06, 1.27, bev=0)
for k in range(3):
    box(M['dark'], 0.42, 0.04, 0.32, hx - 1.05 + k * 0.5, hy - hd / 2 - 0.02, 0.75, bev=0.01)
    box(M['warm_window'], 0.36, 0.04, 0.26, hx - 1.05 + k * 0.5, hy - hd / 2 - 0.04, 0.78, bev=0)
box(M['teal'], 1.4, 0.03, 0.18, hx - 0.55, hy - hd / 2 - 0.03, 1.3, bev=0)
grille(M['dark'], 0.5, 0.4, hx + hw / 2 + 0.02, hy + 0.5, 0.5, rz=math.pi / 2, slats=6)

# --- Electrolysis skid (south-west) --------------------------------------------------
ex, ey = -1.4, -1.55
box(M['dark'], 2.1, 1.25, 0.12, ex, ey, 0.06, bev=0.02)
for k in range(10):
    box(M['offwhite'] if k % 2 == 0 else M['alu'], 0.12, 0.8, 0.7, ex - 0.75 + k * 0.13, ey + 0.05, 0.18, bev=0.01)
for side in (-1, 1):
    box(M['teal'], 0.08, 0.95, 0.85, ex + side * 0.85, ey + 0.05, 0.18, bev=0.015)
for k in range(4):
    strut(M['metal'], (ex - 0.85, ey - 0.3 + k * 0.2, 0.62), (ex + 0.85, ey - 0.3 + k * 0.2, 0.62), 0.02, 8, 'tie_rod')
box(M['glow_cyan'], 1.5, 0.03, 0.05, ex, ey - 0.37, 0.75, bev=0)
# control cabinet with screen
box(M['panel'], 0.5, 0.35, 0.95, ex + 0.75, ey - 0.4, 0.18, rz=0, bev=0.02)
box(M['glow_cyan'], 0.3, 0.02, 0.2, ex + 0.75, ey - 0.58, 0.75, bev=0)
for k in range(3):
    sphere(M['glow_green'] if k else M['glow_orange'], 0.02, ex + 0.62 + k * 0.1, ey - 0.58, 0.55, 8, 6)
# H2 vent + O2 outlet
pipe(M['metal'], [(ex - 0.6, ey + 0.4, 0.9), (ex - 0.6, ey + 0.4, 1.55)], 0.04)
cyl(M['red'], 0.06, 0.1, ex - 0.6, ey + 0.4, 1.55, 12)
pipe(M['teal'], [(ex + 0.3, ey + 0.45, 0.85), (ex + 0.3, ey + 0.45, 1.05), (1.0, ey + 0.45, 1.05), (1.0, -1.85, 1.05)], 0.045)
# cable tray to the hall
pipe(M['black'], [(ex - 0.2, ey + 0.6, 0.2), (ex - 0.2, 0.0, 0.2)], 0.035)

# --- Water tanks (north-east) --------------------------------------------------------
for k, (tx, ty) in enumerate(((1.45, 1.75), (1.45, 0.35))):
    cyl(M['concrete'], 0.68, 0.12, tx, ty, 0.06, 32, bev=0.02)
    cyl(M['offwhite'], 0.6, 1.55, tx, ty, 0.18, 40)
    dome(M['offwhite'], 0.6, tx, ty, 1.73, seg=40, rings=8, sz=0.35)
    for j in range(5):
        torus(M['metal'], 0.605, 0.018, tx, ty, 0.3 + j * 0.33, seg=40, rseg=5)
    # blue band + level gauge
    torus(M['teal'], 0.607, 0.04, tx, ty, 1.55, seg=40, rseg=6)
    o = cbox(M['glow_cyan'], 0.05, 0.03, 1.1, tx + 0.6, ty, 0.85)
    ladder(M['alu'], tx - 0.61, ty, 0.18, 1.65, rz=math.pi / 2)
    # top manway & vent
    cyl(M['dark'], 0.15, 0.1, tx + 0.15, ty, 1.85, 16)
    pipe(M['metal'], [(tx - 0.2, ty + 0.15, 1.82), (tx - 0.2, ty + 0.15, 2.0), (tx - 0.05, ty + 0.15, 2.0)], 0.03)
    # outlet with valve
    pipe(M['metal'], [(tx - 0.62, ty - 0.3, 0.45), (tx - 0.9, ty - 0.3, 0.45)], 0.05)
    flange(M['metal'], 0.08, tx - 0.78, ty - 0.3, 0.45, rot=(0, math.pi / 2, 0), bolts=6, bolt_m=M['dark'])
    cyl(M['red'], 0.07, 0.03, tx - 0.85, ty - 0.3, 0.55, 12)
# platform walkway between the tank tops
box(M['metal'], 0.45, 1.0, 0.04, 1.45, 1.05, 1.95, bev=0.005)
railing(M['yellow'], [(1.24, 0.6, 1.99), (1.24, 1.5, 1.99)], h=0.35, post_every=0.45, r=0.01)
railing(M['yellow'], [(1.66, 0.6, 1.99), (1.66, 1.5, 1.99)], h=0.35, post_every=0.45, r=0.01)

# --- Oxygen spheres (south-east) -------------------------------------------------------
for k, (sx, sy) in enumerate(((0.95, -1.75), (2.15, -1.75))):
    cyl(M['concrete'], 0.55, 0.08, sx, sy, 0.06, 24, bev=0.02)
    for a, x, y in polar(4, 0.38, math.pi / 4):
        strut(M['metal'], (sx + x, sy + y, 0.12), (sx + x * 0.8, sy + y * 0.8, 0.85), 0.035, 8, 'leg')
        cyl(M['dark'], 0.07, 0.04, sx + x, sy + y, 0.12, 10)
    for a, x, y in polar(4, 0.36, math.pi / 4):
        x2, y2 = math.cos(a + math.pi / 2) * 0.36, math.sin(a + math.pi / 2) * 0.36
        strut(M['metal'], (sx + x, sy + y, 0.2), (sx + x2, sy + y2, 0.6), 0.012, 5, 'brace')
    sphere(M['white'], 0.55, sx, sy, 1.15, 40, 20)
    torus(M['teal'], 0.555, 0.03, sx, sy, 1.15, seg=48, rseg=6)
    cyl(M['dark'], 0.08, 0.12, sx, sy, 1.66, 12)
    cyl(M['alu'], 0.03, 0.12, sx, sy, 1.78, 8)
    o = cyl(M['offwhite'], 0.06, 0.02, name='gauge'); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (sx, sy - 0.08, 1.85)
pipe(M['teal'], [(0.95, -1.75, 0.6), (0.95, -1.3, 0.6), (2.15, -1.3, 0.6), (2.15, -1.75, 0.6)], 0.035)

# --- Pipe rack connecting everything ---------------------------------------------------
for py in (-0.65, 0.05, 0.75):
    for px in (0.25, 0.75):
        box(M['metal'], 0.07, 0.07, 1.05, px, py, 0.06, bev=0.005)
    box(M['metal'], 0.62, 0.07, 0.07, 0.5, py, 1.08, bev=0.005)
    box(M['metal'], 0.62, 0.07, 0.07, 0.5, py, 0.7, bev=0.005)
for k, (m, z, r) in enumerate(((M['teal'], 1.2, 0.05), (M['metal'], 1.2, 0.045), (M['offwhite'], 0.82, 0.05))):
    xx = 0.36 + k * 0.14 if k < 2 else 0.5
    pipe(m, [(-0.05, 1.3, z), (xx, 1.3, z), (xx, -0.9, z), (xx, -1.3, z - 0.3)], r)
    for py in (-0.3, 0.4):
        flange(M['metal'], r * 1.6, xx, py, z, rot=(math.pi / 2, 0, 0), bolts=6, bolt_m=M['dark'], thick=0.03)

# Vent stack with ladder
cyl(M['concrete'], 0.3, 0.1, -2.45, -0.2, 0.06, 20)
cyl(M['metal'], 0.18, 2.3, -2.45, -0.2, 0.16, 20, r2=0.15)
for j in range(4):
    torus(M['teal'], 0.175 - j * 0.007, 0.02, -2.45, -0.2, 0.5 + j * 0.5, seg=24, rseg=5)
cyl(M['dark'], 0.22, 0.1, -2.45, -0.2, 2.45, 20)
cyl(M['dark'], 0.24, 0.02, -2.45, -0.2, 2.62, 20)
for a, x, y in polar(4, 0.15):
    strut(M['metal'], (-2.45 + x, -0.2 + y, 2.55), (-2.45 + x, -0.2 + y, 2.62), 0.01, 4, 'cap_leg')
ladder(M['alu'], -2.45 + 0.24, -0.2, 0.16, 2.2, rz=math.pi / 2, w=0.22)
sphere(M['glow_red'], 0.04, -2.45, -0.2, 2.68, 8, 6)

result = finish()
