"""Ice Drill — 5×5 cells. Lattice drilling derrick with a rotating drill string, drill
floor and ladder, ice cuttings, an insulated melt tank and a pump house."""
import math, random
from mathutils import Vector

random.seed(11)
begin('ice_drill')
M = library()
ICE = mat('ice', '#cfeeff', 0.0, 0.12, emit='#1d4a66', strength=0.6)
ICE2 = mat('ice_dirty', '#b6c9d2', 0.0, 0.3)

box(M['pad'], 5, 5, 0.71, 0, 0, -0.65, bev=0.05)
box(M['concrete'], 4.7, 4.7, 0.02, 0, 0, 0.06, bev=0)

# --- Derrick -------------------------------------------------------------------------------
cx, cy = -0.75, 0.6
base, top_w = 0.62, 0.16
H = 3.3
box(M['concrete'], 1.6, 1.6, 0.12, cx, cy, 0.06, bev=0.02)
# drill floor
box(M['metal'], 1.5, 1.5, 0.06, cx, cy, 0.62, bev=0.01)
for k in range(8):
    box(M['dark'], 1.48, 0.015, 0.012, cx, cy - 0.7 + k * 0.2, 0.68, bev=0)
for sx in (-1, 1):
    for sy in (-1, 1):
        box(M['dark'], 0.08, 0.08, 0.5, cx + sx * 0.65, cy + sy * 0.65, 0.12, bev=0.01)
railing(M['yellow'], [(cx - 0.74, cy - 0.74, 0.68), (cx + 0.74, cy - 0.74, 0.68), (cx + 0.74, cy + 0.74, 0.68), (cx - 0.3, cy + 0.74, 0.68)], h=0.4, post_every=0.5, r=0.011)
ladder(M['alu'], cx - 0.3, cy + 0.82, 0.12, 0.55, rz=0, w=0.28)
# four tapered legs
def leg(sx, sy, z):
    t = z / H
    w = base + (top_w - base) * t
    return Vector((cx + sx * w, cy + sy * w, 0.68 + z))
corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
for sx, sy in corners:
    strut(M['orange'], leg(sx, sy, 0), leg(sx, sy, H), 0.045, 8, 'derrick_leg')
levels = 6
for i in range(levels + 1):
    z = H * i / levels
    for k in range(4):
        a = corners[k]
        b = corners[(k + 1) % 4]
        strut(M['orange'], leg(*a, z), leg(*b, z), 0.022, 6, 'derrick_girt')
        if i < levels:
            z2 = H * (i + 1) / levels
            strut(M['orange'], leg(*a, z), leg(*b, z2), 0.014, 5, 'derrick_brace')
            strut(M['orange'], leg(*b, z), leg(*a, z2), 0.014, 5, 'derrick_brace')
# crown block, sheaves and beacon
ztop = 0.68 + H
box(M['dark'], 0.5, 0.5, 0.15, cx, cy, ztop, bev=0.02)
for dx in (-0.1, 0.1):
    o = cyl(M['metal'], 0.1, 0.05, name='sheave'); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (cx + dx, cy + 0.025, ztop + 0.18)
sphere(M['glow_red'], 0.06, cx, cy, ztop + 0.33, 10, 6)
cyl(M['metal'], 0.02, 0.15, cx, cy, ztop + 0.15, 6)
# travelling block + top drive (hangs on cables)
for dx in (-0.06, 0.06):
    strut(M['metal'], (cx + dx, cy, ztop), (cx + dx, cy, 2.55), 0.007, 4, 'drill_line')
box(M['yellow'], 0.36, 0.3, 0.42, cx, cy, 2.15, bev=0.04)
box(M['dark'], 0.2, 0.32, 0.18, cx + 0.15, cy, 2.3, bev=0.02)
box(M['glow_orange'], 0.02, 0.1, 0.04, cx - 0.19, cy, 2.45, bev=0)
# rotating drill string (separate spinning node, pivot at the well centre)
import bpy
parts = []
parts.append(cyl(M['metal'], 0.07, 1.5, 0, 0, 0.0, 16, name='kelly'))
for k in range(4):
    parts.append(cyl(M['dark'], 0.085, 0.06, 0, 0, 0.15 + k * 0.38, 16, name='tool_joint'))
parts.append(cyl(M['yellow'], 0.13, 0.12, 0, 0, 1.42, 6, name='drive_collar'))
for a, x, y in polar(3, 0.11):
    parts.append(cbox(M['dark'], 0.05, 0.12, 0.1, x, y, 1.48, rz=a, name='collar_dog'))
bpy.context.view_layer.update()
drill = _merge(parts, 'spin_drill_string')
for p in parts:
    bpy.data.objects.remove(p, do_unlink=True)
_state['col'].objects.link(drill)
drill.location = (cx, cy, 0.62)
mark_spin(drill, 3.0)
# rotary table + wellhead
cyl(M['dark'], 0.28, 0.08, cx, cy, 0.68, 24)
cyl(M['metal'], 0.18, 0.04, cx, cy, 0.76, 24)
# mud/cuttings return pipe to the chip pile
pipe(M['metal'], [(cx + 0.25, cy - 0.2, 0.72), (cx + 0.9, cy - 0.2, 0.72), (cx + 1.3, cy - 0.6, 0.45)], 0.05)

# --- Ice cuttings pile ----------------------------------------------------------------------
import bmesh
def chunk(m, x, y, z, s):
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s, calc_uvs=True)
    for v in bm.verts:
        v.co *= random.uniform(0.7, 1.15)
        v.co.z *= 0.75
    o = _obj('ice_chunk', bm, m, (x, y, z), (random.random(), random.random(), random.random()))
    return o
for i in range(22):
    a = random.random() * TAU
    r = random.random() ** 0.6 * 0.5
    chunk(ICE if i % 3 else ICE2, 0.85 + math.cos(a) * r, -0.35 + math.sin(a) * r, 0.1 + (0.5 - r) * 0.35, random.uniform(0.07, 0.15))
# ice bin
box(M['dark'], 0.9, 0.7, 0.05, 0.85, -0.35, 0.06, bev=0.01)

# --- Melt tank (insulated, MLI wrapped) -----------------------------------------------------
tx, ty = 1.2, 1.25
cyl(M['concrete'], 0.68, 0.1, tx, ty, 0.06, 32, bev=0.02)
cyl(M['gold'], 0.58, 1.25, tx, ty, 0.16, 40)
for j in range(6):
    torus(M['metal'], 0.585, 0.02, tx, ty, 0.25 + j * 0.2, seg=40, rseg=5)
dome(M['offwhite'], 0.58, tx, ty, 1.41, seg=40, rings=8, sz=0.35)
cyl(M['dark'], 0.12, 0.12, tx + 0.2, ty, 1.55, 16)
o = cbox(M['glow_cyan'], 0.04, 0.03, 0.8, tx - 0.585, ty, 0.8)
# heater box with cables
box(M['panel'], 0.4, 0.3, 0.5, tx, ty - 0.75, 0.06, bev=0.03)
box(M['glow_orange'], 0.2, 0.02, 0.06, tx, ty - 0.91, 0.45, bev=0)
pipe(M['black'], [(tx, ty - 0.6, 0.35), (tx, ty - 0.55, 0.35)], 0.03)
# feed chute from the ice bin
pipe(M['metal'], [(0.85, -0.05, 0.25), (0.85, 0.6, 0.9), (tx - 0.3, ty, 1.5)], 0.06)

# --- Pump house (south-east) ----------------------------------------------------------------
px, py = 1.35, -1.6
box(M['offwhite'], 1.15, 0.85, 0.85, px, py, 0.06, bev=0.04)
box(M['teal'], 1.2, 0.9, 0.12, px, py, 0.88, bev=0.02)
grille(M['dark'], 0.4, 0.4, px + 0.25, py - 0.44, 0.25, slats=6, depth=0.015)
box(M['panel'], 0.32, 0.03, 0.62, px - 0.25, py - 0.44, 0.1, bev=0.01)
box(M['glow_cyan'], 0.3, 0.02, 0.05, px, py - 0.45, 0.78, bev=0)
cyl(M['dark'], 0.18, 0.04, px, py, 1.0, 20)
fan(M['dark'], M['dark'], 0.16, px, py, 0.98, blades=4, spin=7.0, name='spin_pump_fan')
pipe(M['teal'], [(tx, ty - 0.55, 0.25), (tx, py + 0.6, 0.25), (px, py + 0.42, 0.25)], 0.055)
# outgoing water main with flanges and valve, toward the colony (west)
pipe(M['teal'], [(px - 0.58, py, 0.3), (-1.6, py, 0.3), (-2.35, py, 0.3)], 0.06)
for xx in (-0.3, -1.3):
    flange(M['metal'], 0.1, xx, py, 0.3, rot=(0, math.pi / 2, 0), bolts=8, bolt_m=M['dark'])
for xx in (-0.8, -1.9):
    box(M['dark'], 0.12, 0.16, 0.24, xx, py, 0.06, bev=0.01)
cyl(M['red'], 0.09, 0.03, -1.0, py, 0.48, 16)
strut(M['metal'], (-1.0, py, 0.36), (-1.0, py, 0.48), 0.015, 6, 'valve_stem')

# Power cable + junction box from the edge of the pad
box(M['dark'], 0.3, 0.25, 0.45, -2.0, -0.4, 0.06, bev=0.02)
box(M['glow_green'], 0.03, 0.02, 0.06, -2.0, -0.53, 0.42, bev=0)
pipe(M['black'], [(-2.0, -0.25, 0.1), (-2.0, 0.6, 0.1), (cx - 0.7, cy, 0.1)], 0.03)

result = finish()
