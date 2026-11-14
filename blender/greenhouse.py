"""Greenhouse & Chicken Coop — 10×6 cells. Pressurised glass vault on a sintered-regolith
base: hydroponic crop beds under LED grow lights on the west, a protected chicken run on
the east (the game adds animated chickens there), and an airlock on the west end.

Chicken run (game coords, three.js): x 1.8..4.5, z -0.75..2.2  →  Blender y 0.75..-2.2."""
import math, random
from mathutils import Vector

random.seed(7)
begin('greenhouse')
M = library()
G = {
    'leaf': mat('leaf_green', '#4fae3e', 0.0, 0.7),
    'leaf_dark': mat('leaf_dark', '#2e7a30', 0.0, 0.75),
    'lettuce': mat('lettuce', '#8bd45a', 0.0, 0.65),
    'tomato': mat('tomato_red', '#e0372c', 0.0, 0.35),
    'wheat': mat('wheat', '#e1bf4c', 0.0, 0.8),
    'soil': mat('growing_medium', '#4e3324', 0.0, 1.0),
    'straw': mat('straw', '#dcbc64', 0.0, 1.0),
    'wood': mat('wood', '#8a5a3a', 0.0, 0.85),
    'wood_light': mat('wood_light', '#b98a5c', 0.0, 0.85),
    'roof': mat('roof_red', '#a8382a', 0.0, 0.7),
    'trough': mat('planter_white', '#dfe5e6', 0.0, 0.5),
}

L = 9.4          # vault length (x)
RV = 2.65        # vault radius
ZB = 0.32        # springing line (top of the curb)

# --- Base -------------------------------------------------------------------------------
box(M['concrete'], 10, 6, 0.77, 0, 0, -0.65, bev=0.05)
box(M['offwhite'], L + 0.2, 2 * RV + 0.2, ZB - 0.12, 0, 0, 0.12, bev=0.03)
box(M['panel'], L - 0.1, 2 * RV - 0.15, 0.03, 0, 0, ZB - 0.02, bev=0)

# --- Glass vault ---------------------------------------------------------------------------
import bmesh
def glass_vault():
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    seg = 48
    rows = []
    for i in range(seg + 1):
        a = math.pi * i / seg
        y, z = math.cos(a) * RV, ZB + math.sin(a) * RV
        rows.append((bm.verts.new((-L / 2, y, z)), bm.verts.new((L / 2, y, z))))
    for i in range(seg):
        bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
    for side, x in ((0, -L / 2), (1, L / 2)):
        c = bm.verts.new((x, 0, ZB))
        for i in range(seg):
            bm.faces.new((c, rows[i][side], rows[i + 1][side]))
    return _obj('vault', bm, M['glass'])
glass_vault()

# Arched ribs (box-section) and longitudinal purlins.
ribs = 13
for i in range(ribs):
    x = -L / 2 + L * i / (ribs - 1)
    torus(M['white'], RV + 0.015, 0.04, x, 0, ZB, rot=(math.pi / 2, 0, math.pi / 2), seg=40, rseg=6, arc=math.pi)
for k in range(1, 8):
    a = math.pi * k / 8
    y, z = math.cos(a) * (RV + 0.02), math.sin(a) * (RV + 0.02)
    strut(M['white'], (-L / 2, y, ZB + z), (L / 2, y, ZB + z), 0.022, 6, 'purlin')
strut(M['white'], (-L / 2, 0, ZB + RV + 0.03), (L / 2, 0, ZB + RV + 0.03), 0.05, 8, 'ridge')
# end wall mullions
for x in (-L / 2, L / 2):
    for k in (-2, -1, 0, 1, 2):
        yy = k * 0.95
        h = math.sqrt(max(0.0, RV * RV - yy * yy))
        strut(M['white'], (x, yy, ZB), (x, yy, ZB + h), 0.03, 6, 'mullion')
    strut(M['white'], (x, -RV, ZB + 1.2), (x, RV, ZB + 1.2), 0.03, 6, 'transom')
# ridge vents with small solar fans
for x in (-2.5, 2.5):
    box(M['offwhite'], 0.7, 0.4, 0.14, x, 0, ZB + RV + 0.02, bev=0.03)
    grille(M['dark'], 0.55, 0.1, x, -0.2, ZB + RV + 0.03, slats=3, depth=0.01)

# --- Crops (west 2/3) ---------------------------------------------------------------------
LIGHT_Z = ZB + 1.95
bed_y = (-1.45, 0.0, 1.45)
bx0, bx1 = -4.25, 0.75
for bi, by in enumerate(bed_y):
    # hydroponic trough on legs
    for x in (bx0 + 0.2, (bx0 + bx1) / 2, bx1 - 0.2):
        for dy in (-0.35, 0.35):
            box(M['metal'], 0.05, 0.05, 0.35, x, by + dy, ZB, bev=0)
    box(G['trough'], bx1 - bx0, 0.85, 0.22, (bx0 + bx1) / 2, by, ZB + 0.33, bev=0.02)
    box(G['soil'], bx1 - bx0 - 0.08, 0.75, 0.02, (bx0 + bx1) / 2, by, ZB + 0.54, bev=0)
    # drip line
    strut(M['black'], (bx0, by, ZB + 0.6), (bx1, by, ZB + 0.6), 0.012, 5, 'drip')
    # plants
    n = 9
    for i in range(n):
        x = bx0 + 0.3 + i * (bx1 - bx0 - 0.6) / (n - 1)
        kind = (bi + i // 3) % 3
        zb = ZB + 0.56
        if kind == 0:
            # lettuce rosettes
            for dy in (-0.2, 0.2):
                for j in range(5):
                    a = j * TAU / 5 + random.random()
                    s = sphere(G['lettuce'] if j % 2 else G['leaf'], 0.11, x + math.cos(a) * 0.07, by + dy + math.sin(a) * 0.07, zb + 0.06, 8, 5, scale=(1.3, 0.8, 0.5), name='leaf')
                    s.rotation_euler = (0.4, 0, a)
                sphere(G['lettuce'], 0.07, x, by + dy, zb + 0.09, 8, 5)
        elif kind == 1:
            # staked tomato vines
            for dy in (-0.2, 0.2):
                strut(G['wood_light'], (x, by + dy, zb), (x, by + dy, zb + 0.75), 0.012, 4, 'stake')
                for j in range(5):
                    hz = zb + 0.12 + j * 0.13
                    sphere(G['leaf_dark'] if j % 2 else G['leaf'], 0.11 - j * 0.008, x + random.uniform(-0.05, 0.05), by + dy + random.uniform(-0.05, 0.05), hz, 8, 5, scale=(1.1, 1.1, 0.8), name='vine')
                for j in range(3):
                    sphere(G['tomato'], 0.04, x + random.uniform(-0.1, 0.1), by + dy + random.uniform(-0.1, 0.1), zb + 0.2 + random.random() * 0.4, 8, 6, name='tomato')
        else:
            # wheat tufts
            for dy in (-0.22, 0.0, 0.22):
                for j in range(4):
                    a = j * TAU / 4 + random.random()
                    ox, oy = math.cos(a) * 0.05, math.sin(a) * 0.05
                    strut(G['leaf'], (x + ox, by + dy + oy, zb), (x + ox * 2, by + dy + oy * 2, zb + 0.32), 0.008, 4, 'stalk')
                    sphere(G['wheat'], 0.025, x + ox * 2.1, by + dy + oy * 2.1, zb + 0.36, 6, 4, scale=(1, 1, 2.2), name='ear')
    # LED grow-light bar on hangers
    box(M['dark'], bx1 - bx0 - 0.3, 0.16, 0.05, (bx0 + bx1) / 2, by, LIGHT_Z, bev=0.01)
    box(M['glow_pink'], bx1 - bx0 - 0.4, 0.12, 0.012, (bx0 + bx1) / 2, by, LIGHT_Z - 0.006, bev=0)
    for x in (bx0 + 0.4, bx1 - 0.4):
        zt = ZB + math.sqrt(max(0, RV * RV - by * by)) - 0.03
        strut(M['metal'], (x, by, LIGHT_Z + 0.05), (x, by, zt), 0.006, 4, 'hanger')

# Water tank + nutrient doser in the north-west corner
cyl(M['offwhite'], 0.32, 0.8, -4.3, 2.1, ZB, 24)
dome(M['offwhite'], 0.32, -4.3, 2.1, ZB + 0.8, seg=24, rings=5, sz=0.4)
torus(M['teal'], 0.322, 0.025, -4.3, 2.1, ZB + 0.55, seg=24, rseg=5)
pipe(M['metal'], [(-4.0, 2.1, ZB + 0.2), (-3.8, 2.1, ZB + 0.2), (-3.8, 1.45, ZB + 0.6), (-3.6, 1.45, ZB + 0.6)], 0.025)

# --- Divider fence --------------------------------------------------------------------------
fx = 1.3
for i in range(7):
    y = -2.3 + i * 0.77
    box(G['wood'], 0.09, 0.09, 0.75, fx, y, ZB, bev=0.01)
for z in (0.22, 0.48, 0.68):
    box(G['wood_light'], 0.05, 4.7, 0.07, fx, 0, ZB + z, bev=0.01)
# wire mesh
for k in range(24):
    y = -2.3 + k * 0.2
    strut(M['alu'], (fx + 0.04, y, ZB), (fx + 0.04, y, ZB + 0.7), 0.004, 3, 'mesh')

# --- Chicken run (east) ------------------------------------------------------------------------
box(G['straw'], 3.4, 4.9, 0.04, 3.05, 0, ZB, bev=0.01)
for i in range(40):
    x = random.uniform(1.5, 4.6)
    y = random.uniform(-2.3, 2.3)
    cbox(G['straw'], random.uniform(0.08, 0.16), 0.01, 0.01, x, y, ZB + 0.045, rz=random.random() * TAU)
# Coop house in the north-east corner (Blender +y = north)
cx, cy = 3.85, 1.65
for sx in (-0.55, 0.55):
    for sy in (-0.45, 0.45):
        box(G['wood'], 0.08, 0.08, 0.3, cx + sx, cy + sy, ZB, bev=0.01)
box(G['wood_light'], 1.25, 1.05, 0.65, cx, cy, ZB + 0.3, bev=0.02)
for k in range(9):
    box(G['wood'], 1.27, 0.02, 0.03, cx, cy - 0.53, ZB + 0.34 + k * 0.07, bev=0)
# gable roof
for side in (-1, 1):
    o = box(G['roof'], 1.45, 0.72, 0.05, cx, cy + side * 0.3, ZB + 0.98, rx=side * 0.6, bev=0.01)
    o.location = (cx, cy + side * 0.3, ZB + 0.95)
box(G['wood'], 1.5, 0.08, 0.06, cx, cy, ZB + 1.16, bev=0.01)
# door + ramp
box(M['dark'], 0.3, 0.03, 0.32, cx - 0.3, cy - 0.54, ZB + 0.32, bev=0)
o = box(G['wood'], 0.32, 0.7, 0.03, cx - 0.3, cy - 0.85, ZB + 0.02, rx=-0.45, bev=0)
for k in range(5):
    box(G['wood_light'], 0.3, 0.02, 0.02, cx - 0.3, cy - 0.62 - k * 0.12, ZB + 0.27 - k * 0.055, bev=0)
# nest boxes on the side
for k in range(3):
    box(G['wood'], 0.32, 0.3, 0.3, cx + 0.72, cy - 0.3 + k * 0.32, ZB + 0.35, bev=0.01)
    box(G['straw'], 0.24, 0.24, 0.03, cx + 0.72, cy - 0.3 + k * 0.32, ZB + 0.45, bev=0)
# feeder + waterer + heat lamp
cyl(M['metal'], 0.2, 0.08, 2.6, -1.8, ZB, 20)
cyl(M['metal'], 0.1, 0.35, 2.6, -1.8, ZB + 0.08, 16, r2=0.12)
cyl(M['alu'], 0.14, 0.04, 2.6, -1.8, ZB + 0.43, 16)
cyl(M['red'], 0.22, 0.05, 3.9, -1.9, ZB, 20)
cyl(M['offwhite'], 0.15, 0.4, 3.9, -1.9, ZB + 0.05, 20, r2=0.13)
dome(M['offwhite'], 0.13, 3.9, -1.9, ZB + 0.45, seg=20, rings=4)
strut(M['metal'], (2.6, 0.6, ZB + 1.9), (2.6, 0.6, ZB + RV - 0.05), 0.006, 4, 'lamp_cord')
cyl(M['dark'], 0.12, 0.12, 2.6, 0.6, ZB + 1.78, 16, r2=0.04)
cyl(M['glow_orange'], 0.1, 0.01, 2.6, 0.6, ZB + 1.775, 16)
# white grow light over the run
box(M['dark'], 2.6, 0.14, 0.04, 3.1, -0.4, LIGHT_Z + 0.1, bev=0.01)
box(M['glow_white'], 2.5, 0.1, 0.01, 3.1, -0.4, LIGHT_Z + 0.095, bev=0)

# --- West airlock ------------------------------------------------------------------------------
ax = -L / 2 - 0.35
box(M['offwhite'], 0.75, 1.6, 1.4, ax, 0, 0.12, bev=0.04)
box(M['orange'], 0.8, 1.65, 0.12, ax, 0, 1.47, bev=0.02)
box(M['dark'], 0.05, 0.75, 1.05, ax - 0.38, 0, 0.16, bev=0.01)
box(M['panel'], 0.05, 0.65, 0.95, ax - 0.4, 0, 0.18, bev=0.01)
o = cyl(M['window'], 0.1, 0.03, name='port'); o.rotation_euler = (0, -math.pi / 2, 0); o.location = (ax - 0.42, 0, 0.85)
box(M['glow_green'], 0.03, 0.08, 0.05, ax - 0.4, 0.5, 1.05, bev=0)
box(M['glow_white'], 0.04, 0.6, 0.03, ax - 0.4, 0, 1.25, bev=0)
for i in range(6):
    cbox(M['yellow'] if i % 2 == 0 else M['black'], 0.3, 0.12, 0.02, ax - 0.55, -0.3 + i * 0.12, 0.13, rz=0.6)

# --- Exterior: HVAC + CO2 feed on the north side ------------------------------------------------
hx, hy = -1.2, 2.75
box(M['panel'], 1.1, 0.42, 0.55, hx, hy + 0.05, 0.12, bev=0.03)
o = cyl(M['dark'], 0.2, 0.04, name='hvac_ring'); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (hx - 0.25, hy - 0.17, 0.42)
grille(M['dark'], 0.4, 0.35, hx + 0.3, hy - 0.17, 0.2, slats=5, depth=0.015)
pipe(M['metal'], [(hx, hy + 0.05, 0.67), (hx, hy + 0.05, 0.85), (hx, 2.35, 0.85), (hx, 2.35, 0.6)], 0.05)
tube(M['offwhite'], 0.16, 0.9, 1.5, 2.85, 0.32, seg=20)
for e in (-0.45, 0.45):
    s = sphere(M['offwhite'], 0.16, 1.5 + e, 2.85, 0.32, 20, 10, scale=(0.5, 1, 1), name='co2_end')
box(M['dark'], 0.12, 0.3, 0.18, 1.2, 2.85, 0.12, bev=0.01)
box(M['dark'], 0.12, 0.3, 0.18, 1.8, 2.85, 0.12, bev=0.01)
pipe(M['metal'], [(1.05, 2.85, 0.32), (0.8, 2.85, 0.32), (0.8, 2.6, 0.45)], 0.025)
# perimeter lights
for x in (-4.6, -1.6, 1.6, 4.6):
    for y in (-2.9, 2.9):
        box(M['dark'], 0.1, 0.1, 0.1, x, y, 0.12, bev=0.01)
        box(M['glow_white'], 0.06, 0.02, 0.03, x, y - 0.05 * (1 if y < 0 else -1), 0.18, bev=0)

result = finish()
