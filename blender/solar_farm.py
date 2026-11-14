"""Solar Farm — 10×7 cells. Three single-axis tracker rows of framed PV modules facing
south (the base is at 18°N), plus a battery container, inverter and transformer."""
import math, bmesh
from mathutils import Vector

begin('solar_farm')
M = library()

def paint_cells(px, w, h):
    # 6 × 10 monocrystalline cells with silver busbars and white gaps.
    for y in range(h):
        for x in range(w):
            u = x / w * 6
            v = y / h * 10
            fu, fv = u % 1, v % 1
            i = (y * w + x) * 4
            if fu < 0.05 or fv < 0.05:
                c = (0.78, 0.8, 0.84)
            else:
                # chamfered cell corners
                cx, cy = min(fu, 1 - fu), min(fv, 1 - fv)
                if cx + cy < 0.14:
                    c = (0.78, 0.8, 0.84)
                elif abs(fu - 0.36) < 0.008 or abs(fu - 0.68) < 0.008:
                    c = (0.55, 0.58, 0.62)
                else:
                    g = 0.04 + 0.03 * (fv)
                    c = (0.02 + g * 0.3, 0.05 + g * 0.6, 0.18 + g)
            px[i:i + 4] = (*c, 1.0)

cells_img = image('pv_cells', 192, 320, paint_cells)
PV = mat('pv_cells', '#ffffff', 0.4, 0.22, image=cells_img)

def plane(m, sx, sy, x, y, z, rx=0.0, rz=0.0, name='plane'):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
    o = _obj(name, bm, m, (x, y, z), (rx, 0, rz))
    return o

# --- Ground --------------------------------------------------------------------------
box(M['pad'], 10, 7, 0.71, 0, 0, -0.65, bev=0.05)
box(M['concrete'], 9.6, 6.6, 0.02, 0, 0, 0.06, bev=0)
for x in (-4.95, 4.95):
    for y in (-3.45, 3.45):
        cyl(M['yellow'], 0.06, 0.5, x, y, 0.06, 8)
        sphere(M['glow_orange'], 0.04, x, y, 0.58, 8, 6)

# --- Tracker rows ---------------------------------------------------------------------
TILT = math.radians(28)
rows = (2.2, 0.0, -2.2)
x0, x1 = -4.55, 1.55
mods = 5
mw = (x1 - x0) / mods
zc = 0.92
for ry in rows:
    # torque tube + posts with footing and slew drive
    tube(M['metal'], 0.06, x1 - x0 + 0.2, (x0 + x1) / 2, ry, zc, seg=12)
    for px in (x0 + 0.1, (x0 + x1) / 2 - 1.2, (x0 + x1) / 2 + 1.2, x1 - 0.1):
        cyl(M['concrete'], 0.17, 0.12, px, ry, 0.06, 12, bev=0.02)
        box(M['metal'], 0.1, 0.1, zc - 0.18, px, ry, 0.18, bev=0.01)
        cyl(M['dark'], 0.11, 0.16, px, ry - 0.02, zc - 0.08, 12, rot=(math.pi / 2, 0, 0))
    # slew motor
    box(M['dark'], 0.2, 0.18, 0.2, (x0 + x1) / 2, ry + 0.16, zc - 0.25, bev=0.02)
    cyl(M['metal'], 0.05, 0.12, (x0 + x1) / 2, ry + 0.25, zc - 0.15, 8)
    for k in range(mods):
        mx = x0 + mw * (k + 0.5)
        # module purlins under the panel
        for dx in (-0.35, 0.35):
            cbox(M['alu'], 0.05, 1.45, 0.05, mx + dx, ry, zc + 0.07, rx=TILT)
        # frame
        o = cbox(M['alu'], mw - 0.06, 1.55, 0.05, mx, ry - 0.01, zc + 0.12, rx=TILT, bev=0.01)
        # cells
        plane(PV, mw - 0.12, 1.49, mx, ry - 0.01 - 0.026 * math.sin(TILT), zc + 0.12 + 0.026 * math.cos(TILT), rx=TILT)
        # junction box on the back
        cbox(M['black'], 0.16, 0.1, 0.04, mx, ry + 0.08, zc + 0.03, rx=TILT)
    # string cable to the trench
    pipe(M['black'], [(x1 - 0.05, ry, zc - 0.1), (x1 + 0.25, ry, 0.35), (x1 + 0.45, ry, 0.1), (2.2, ry, 0.1)], 0.025)

# Cable trench with cover plates from the rows to the equipment yard.
box(M['concrete'], 0.32, 5.0, 0.07, 2.2, 0, 0.06, bev=0.01)
for i in range(10):
    box(M['metal'], 0.3, 0.46, 0.015, 2.2, -2.25 + i * 0.5, 0.13, bev=0)

# Panel-cleaning robot parked on the middle row.
rx = x0 + mw * 2.5
cbox(M['white'], 0.28, 1.5, 0.12, rx, -0.03 - 0.08 * math.sin(TILT), zc + 0.24 + 0.08 * math.cos(TILT), rx=TILT, bev=0.02)
tube(M['black'], 0.06, 0.32, rx, 0.0 - 0.1, zc + 0.3, seg=10, heading=0, pitch=0)
cbox(M['glow_cyan'], 0.05, 0.3, 0.02, rx, -0.12, zc + 0.37, rx=TILT)

# --- Equipment yard (east) -------------------------------------------------------------
# Battery container: corrugated ISO-style box with doors and an AC unit.
bx, by = 3.75, 1.35
box(M['dark'], 2.15, 1.25, 0.08, bx, by, 0.06, bev=0.01)
box(M['offwhite'], 2.05, 1.15, 1.15, bx, by, 0.14, bev=0.03)
corrugated(M['offwhite'], 1.8, 1.0, bx, by - 0.58, 0.22, pitch=0.1, depth=0.03)
corrugated(M['offwhite'], 1.8, 1.0, bx, by + 0.58, 0.22, rz=math.pi, pitch=0.1, depth=0.03)
box(M['teal'], 2.1, 1.2, 0.08, bx, by, 1.29, bev=0.02)
# end doors with lock bars
for i, dx in enumerate((-0.25, 0.25)):
    box(M['panel'], 0.03, 0.48, 0.95, bx + 1.04, by + dx, 0.22, bev=0.005)
    for k in (-0.1, 0.1):
        strut(M['metal'], (bx + 1.07, by + dx + k, 0.25), (bx + 1.07, by + dx + k, 1.13), 0.012, 6, 'lockbar')
# warning label + status lights
box(M['yellow'], 0.4, 0.02, 0.25, bx - 0.5, by - 0.61, 0.8, bev=0)
for k in range(4):
    sphere(M['glow_green'] if k < 3 else M['glow_orange'], 0.025, bx + 0.1 + k * 0.1, by - 0.61, 1.05, 8, 6)
# roof AC unit with spinning fan
box(M['panel'], 0.7, 0.7, 0.28, bx - 0.45, by, 1.37, bev=0.03)
cyl(M['dark'], 0.27, 0.03, bx - 0.45, by, 1.64, 24)
fan(M['dark'], M['dark'], 0.24, bx - 0.45, by, 1.6, blades=5, spin=9.0, name='spin_bat_fan')
for a, x, y in polar(6, 0.27):
    strut(M['metal'], (bx - 0.45 + x, by + y, 1.67), (bx - 0.45 - x, by - y, 1.67), 0.008, 4, 'fan_guard')
torus(M['metal'], 0.27, 0.01, bx - 0.45, by, 1.67, seg=24, rseg=4)
grille(M['dark'], 0.5, 0.2, bx + 0.35, by, 1.4, slats=5)

# Inverter cabinets
ix, iy = 3.1, -0.65
for k in range(3):
    box(M['panel'], 0.42, 0.45, 0.9, ix + k * 0.46, iy, 0.06, bev=0.02)
    box(M['dark'], 0.3, 0.02, 0.18, ix + k * 0.46, iy - 0.23, 0.7, bev=0)
    sphere(M['glow_green'], 0.022, ix + k * 0.46 + 0.12, iy - 0.24, 0.6, 8, 6)
    grille(M['dark'], 0.3, 0.3, ix + k * 0.46, iy - 0.235, 0.15, slats=6, depth=0.015)
box(M['metal'], 1.42, 0.5, 0.05, ix + 0.46, iy, 0.96, bev=0.01)

# Transformer with cooling fins
tx, ty = 4.0, -2.2
box(M['concrete'], 1.3, 1.0, 0.1, tx, ty, 0.06, bev=0.02)
box(M['dark'], 0.8, 0.6, 0.75, tx, ty, 0.16, bev=0.03)
for k in range(9):
    box(M['metal'], 0.02, 0.18, 0.55, tx - 0.36 + k * 0.09, ty - 0.38, 0.22, bev=0)
    box(M['metal'], 0.02, 0.18, 0.55, tx - 0.36 + k * 0.09, ty + 0.38, 0.22, bev=0)
for k in range(3):
    cyl(M['offwhite'], 0.05, 0.12, tx - 0.25 + k * 0.25, ty, 0.91, 10)
    for j in range(4):
        cyl(M['offwhite'], 0.075, 0.025, tx - 0.25 + k * 0.25, ty, 0.94 + j * 0.05, 12)
box(M['yellow'], 0.25, 0.02, 0.2, tx, ty - 0.31, 0.5, bev=0)
# safety fence around the transformer
railing(M['yellow'], [(tx - 0.62, ty - 0.48, 0.16), (tx + 0.62, ty - 0.48, 0.16), (tx + 0.62, ty + 0.48, 0.16), (tx - 0.62, ty + 0.48, 0.16), (tx - 0.62, ty - 0.48, 0.16)], h=0.5, post_every=0.4, r=0.012)

# Feeders between cabinets, transformer and container
pipe(M['black'], [(2.3, -0.65, 0.1), (2.85, -0.65, 0.1)], 0.03)
pipe(M['black'], [(3.6, -0.4, 0.5), (3.6, 0.4, 0.5), (3.6, 0.7, 0.3)], 0.03)
pipe(M['black'], [(4.0, -1.0, 0.2), (4.0, -1.7, 0.2)], 0.035)

# Light / comms mast
cyl(M['concrete'], 0.15, 0.1, 4.75, -0.6, 0.06, 12)
cyl(M['metal'], 0.035, 2.1, 4.75, -0.6, 0.16, 8)
box(M['dark'], 0.3, 0.06, 0.1, 4.75, -0.6, 2.1, bev=0.01)
box(M['glow_white'], 0.26, 0.04, 0.03, 4.75, -0.63, 2.08, bev=0)
sphere(M['glow_red'], 0.05, 4.75, -0.6, 2.32, 8, 6)

result = finish()
