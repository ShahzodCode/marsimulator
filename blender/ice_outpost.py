"""Ice Outpost — a remote ice mine seen on the planet map (about 4 units across, scaled in game).

A sintered-regolith pad with a blast berm; a shelter module wrapped in a white beta-cloth
thermal blanket and buried under a ring of regolith bags (radiation and micrometeorite
shield); a compact ice-drill mast with a spinning drill string; a gold MLI melt tank;
a radiator wing, a dust-shielded solar array, a relay dish and a beacon mast.
Kept low-poly: it is drawn small, far from the camera.
"""
import math, random
import bpy

random.seed(7)
begin('ice_outpost')
M = library()
BETA = mat('beta_cloth', '#ece8de', 0.0, 0.8)
SEAM = mat('beta_seam', '#c9c3b6', 0.0, 0.85)
RADIATOR = mat('radiator_white', '#f2f4f5', 0.15, 0.3)
SOLAR = mat('solar_cell', '#1b2c55', 0.6, 0.22)
ICE = mat('ice', '#cfeeff', 0.0, 0.12, emit='#1d4a66', strength=0.6)

# --- Pad and blast berm -------------------------------------------------------------------
cyl(M['pad'], 2.05, 0.7, 0, 0, -0.65, 8)                     # sintered pad (octagon)
cyl(M['concrete'], 1.95, 0.02, 0, 0, 0.05, 8)
# low berm of piled regolith on the north rim (dust and blast shield)
for a, x, y in polar(16, 2.1, 0.4):
    if math.sin(a) < -0.35:
        continue
    o = sphere(M['regolith'], 0.24, x, y, 0.0, 8, 4, scale=(1.5, 1.0, 0.35))
    o.rotation_euler = (0, 0, a)
# landing/cargo marking: an orange ring with a cross, south-west
lx, ly = -1.0, -1.0
ring(M['orange'], 0.42, 0.48, 0.012, lx, ly, 0.07, seg=24)
box(M['orange'], 0.5, 0.06, 0.012, lx, ly, 0.07, bev=0)
box(M['orange'], 0.06, 0.5, 0.012, lx, ly, 0.07, bev=0)

# --- Shelter module (centre-east) ---------------------------------------------------------
hx, hy = 0.35, 0.25
# sintered footing, then a ring of regolith bags piled against the walls
cyl(M['concrete'], 0.95, 0.08, hx, hy, 0.05, 16)
for tier, (rr, z, n) in enumerate(((0.88, 0.13, 16), (0.84, 0.29, 15), (0.79, 0.44, 14))):
    for a, x, y in polar(n, rr, tier * 0.2):
        box(M['sandbag'], 0.34, 0.2, 0.16, hx + x, hy + y, z, rz=a + math.pi / 2, bev=0.05, name='bag')
# the module: a squat cylinder in white beta-cloth with seam bands and a blanket-covered dome
cyl(BETA, 0.72, 0.75, hx, hy, 0.13, 24)
for j in range(3):
    torus(SEAM, 0.725, 0.014, hx, hy, 0.3 + j * 0.2, seg=24, rseg=4)
for a, x, y in polar(8, 0.722):
    box(SEAM, 0.02, 0.03, 0.72, hx + x, hy + y, 0.14, rz=a, bev=0)
dome(BETA, 0.72, hx, hy, 0.88, seg=24, rings=6, sz=0.45)
# regolith bags laid on the roof for extra shielding
for a, x, y in polar(7, 0.38, 0.3):
    o = box(M['sandbag'], 0.3, 0.18, 0.12, hx + x, hy + y, 1.02, rz=a + math.pi / 2, bev=0.05, name='roof_bag')
    o.rotation_euler = (0, -0.38, a)
box(M['sandbag'], 0.3, 0.3, 0.12, hx, hy, 1.15, bev=0.05, name='roof_bag')
# hatch ring and a small sensor mast on top
cyl(M['dark'], 0.1, 0.1, hx + 0.25, hy - 0.2, 1.1, 10)
cyl(M['metal'], 0.015, 0.45, hx - 0.3, hy + 0.15, 1.05, 6)
box(M['white'], 0.08, 0.08, 0.06, hx - 0.3, hy + 0.15, 1.5, bev=0.01)
# airlock on the south side: a short white tunnel with an orange-trimmed hatch and a dust porch
ax, ay = hx, hy - 0.95
box(M['white'], 0.5, 0.45, 0.5, ax, ay, 0.13, bev=0.06)
box(M['orange'], 0.52, 0.04, 0.06, ax, ay - 0.22, 0.6, bev=0)
box(M['dark'], 0.28, 0.03, 0.38, ax, ay - 0.235, 0.15, bev=0.02)
box(M['window'], 0.12, 0.02, 0.08, ax, ay - 0.25, 0.42, bev=0)
box(M['metal'], 0.6, 0.35, 0.03, ax, ay - 0.35, 0.06, bev=0)
sphere(M['glow_white'], 0.025, ax + 0.2, ay - 0.25, 0.58, 6, 4)

# --- Ice drill (north-west) ---------------------------------------------------------------
dx, dy = -0.95, 0.75
box(M['concrete'], 0.75, 0.75, 0.08, dx, dy, 0.05, bev=0.02)
box(M['metal'], 0.66, 0.66, 0.05, dx, dy, 0.25, bev=0.01)
for sx in (-1, 1):
    for sy in (-1, 1):
        box(M['dark'], 0.06, 0.06, 0.13, dx + sx * 0.28, dy + sy * 0.28, 0.12, bev=0)
# tripod mast in safety orange
H = 1.55
for a, x, y in polar(3, 0.3, 0.5):
    strut(M['orange'], (dx + x, dy + y, 0.3), (dx, dy, 0.3 + H), 0.035, 6, 'mast_leg')
    strut(M['orange'], (dx + x * 0.55, dy + y * 0.55, 0.3 + H * 0.45),
          (dx + x * 0.55 * math.cos(2.09) - y * 0.55 * math.sin(2.09), dy + x * 0.55 * math.sin(2.09) + y * 0.55 * math.cos(2.09), 0.3 + H * 0.45),
          0.015, 5, 'mast_girt')
box(M['dark'], 0.18, 0.18, 0.12, dx, dy, 0.3 + H - 0.04, bev=0.02)
sphere(M['glow_red'], 0.035, dx, dy, 0.3 + H + 0.12, 8, 5)
# drill motor hanging on the mast
box(M['yellow'], 0.2, 0.2, 0.24, dx, dy, 1.05, bev=0.03)
strut(M['metal'], (dx, dy, 1.29), (dx, dy, 0.3 + H - 0.04), 0.008, 4, 'drill_line')
parts = [cyl(M['metal'], 0.035, 0.8, 0, 0, 0.0, 10, name='drill_rod')]
for k in range(3):
    parts.append(cyl(M['dark'], 0.045, 0.04, 0, 0, 0.12 + k * 0.25, 10, name='tool_joint'))
for a, x, y in polar(3, 0.05):
    parts.append(cbox(M['dark'], 0.025, 0.06, 0.06, x, y, 0.7, rz=a, name='collar_dog'))
bpy.context.view_layer.update()
drill = _merge(parts, 'spin_drill_string')
for p in parts:
    bpy.data.objects.remove(p, do_unlink=True)
_state['col'].objects.link(drill)
drill.location = (dx, dy, 0.25)
mark_spin(drill, 3.0)
cyl(M['dark'], 0.12, 0.05, dx, dy, 0.3, 14)
# ice chips bin beside the drill
box(M['dark'], 0.42, 0.32, 0.18, dx + 0.6, dy - 0.05, 0.06, bev=0.02)
for i in range(6):
    o = sphere(ICE, random.uniform(0.05, 0.08), dx + 0.6 + random.uniform(-0.13, 0.13), dy - 0.05 + random.uniform(-0.08, 0.08), 0.25, 6, 4)
    o.scale = (1, 1, 0.7)

# --- Melt tank (MLI-wrapped, north-east) ---------------------------------------------------
tx, ty = 1.25, 1.15
cyl(M['concrete'], 0.4, 0.06, tx, ty, 0.05, 12)
cyl(M['gold'], 0.32, 0.65, tx, ty, 0.11, 16)
for j in range(3):
    torus(M['metal'], 0.325, 0.015, tx, ty, 0.2 + j * 0.2, seg=16, rseg=4)
dome(M['offwhite'], 0.32, tx, ty, 0.76, seg=16, rings=4, sz=0.3)
cbox(M['glow_cyan'], 0.025, 0.02, 0.4, tx - 0.325, ty, 0.45)
# drill → tank → shelter plumbing (insulated lines)
pipe(M['metal'], [(dx + 0.6, dy + 0.12, 0.25), (dx + 0.6, dy + 0.55, 0.25), (tx - 0.3, ty + 0.15, 0.25)], 0.03)
pipe(M['teal'], [(tx, ty - 0.32, 0.2), (tx, hy + 0.65, 0.2), (hx + 0.65, hy + 0.45, 0.2)], 0.035)

# --- Radiator wing (east) ------------------------------------------------------------------
rx, ry = 1.75, -0.2
strut(M['dark'], (rx, ry, 0.05), (rx, ry, 0.7), 0.025, 6, 'rad_post')
box(RADIATOR, 0.03, 0.9, 0.55, rx, ry, 0.35, bev=0.005)
for k in range(5):
    box(M['metal'], 0.035, 0.012, 0.55, rx, ry - 0.36 + k * 0.18, 0.35, bev=0)
pipe(M['teal'], [(hx + 0.7, hy - 0.1, 0.3), (rx - 0.05, ry, 0.3)], 0.025)

# --- Solar array (south-east), tilted, on a ballasted frame ---------------------------------
sx0, sy0 = 1.2, -1.15
for ox in (-0.35, 0.35):
    strut(M['metal'], (sx0 + ox, sy0 + 0.15, 0.05), (sx0 + ox, sy0 + 0.15, 0.45), 0.018, 5, 'solar_leg')
    strut(M['metal'], (sx0 + ox, sy0 - 0.2, 0.05), (sx0 + ox, sy0 - 0.2, 0.22), 0.018, 5, 'solar_leg')
    box(M['sandbag'], 0.16, 0.16, 0.08, sx0 + ox, sy0 - 0.2, 0.05, bev=0.03, name='ballast')
o = box(SOLAR, 0.95, 0.55, 0.025, sx0, sy0, 0.3, bev=0)
o.rotation_euler = (0.55, 0, 0)
o.location = (sx0, sy0 - 0.02, 0.3)
o = box(M['alu'], 0.99, 0.59, 0.015, sx0, sy0, 0.3, bev=0)
o.rotation_euler = (0.55, 0, 0)
o.location = (sx0, sy0 - 0.03, 0.285)
pipe(M['black'], [(sx0 - 0.4, sy0, 0.08), (hx + 0.6, hy - 0.6, 0.08)], 0.018)

# --- Relay dish and beacon mast (west) ------------------------------------------------------
cx, cy = -1.45, -0.2
cyl(M['dark'], 0.08, 0.35, cx, cy, 0.05, 8)
lathe(M['white'], [(0.0, 0.0), (0.18, 0.04), (0.32, 0.12)], cx, cy, 0.42, seg=20, name='dish', rot=(0.7, 0, 2.2))
cyl(M['dark'], 0.06, 0.06, cx, cy, 0.38, 8)
cyl(M['metal'], 0.02, 1.2, cx + 0.3, cy + 0.35, 0.05, 6)
sphere(M['glow_orange'], 0.04, cx + 0.3, cy + 0.35, 1.28, 8, 5)

result = finish()
