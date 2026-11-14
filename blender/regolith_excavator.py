"""Regolith Excavator — 6×6 cells. A tracked bucket-wheel excavator digging in a pit,
a truss conveyor lifting the soil to a sorting plant with hopper and screens, output piles."""
import math, random
from mathutils import Vector, Matrix

random.seed(3)
begin('regolith_excavator')
M = library()

box(M['pad'], 6, 6, 0.71, 0, 0, -0.65, bev=0.05)
# dig pit (south-east): sunken dark floor with a raised rim of spoil
PX, PY = 1.25, -1.35
lathe(M['regolith'], [(0.0, 0.035), (0.8, 0.035), (1.15, 0.12), (1.45, 0.2), (1.7, 0.07), (1.85, 0.06)], PX, PY, 0.04, seg=48, name='pit_rim')
cyl(M['regolith_dark'], 0.95, 0.03, PX, PY, 0.06, 40)
for i in range(18):
    a = random.random() * TAU
    r = random.uniform(1.2, 1.75)
    s = sphere(M['regolith'] if i % 3 else M['regolith_dark'], random.uniform(0.05, 0.12), PX + math.cos(a) * r, PY + math.sin(a) * r, 0.12, 7, 5, scale=(1.2, 1, 0.6), name='clod')
# track marks
for k in range(6):
    box(M['regolith_dark'], 0.18, 0.08, 0.012, -0.3 + k * 0.35, -2.55, 0.06, rz=0.1, bev=0)

# --- Bucket-wheel excavator (sits east of the pit, boom reaching in) ------------------------
ex, ey = 2.0, 0.1
# crawler tracks
for side in (-1, 1):
    ty = ey + side * 0.45
    tube(M['dark'], 0.16, 1.1, ex, ty, 0.22, heading=math.pi / 2, seg=16)
    for e in (-0.55, 0.55):
        o = cyl(M['black'], 0.2, 0.26, name='sprocket'); o.rotation_euler = (math.pi / 2, 0, 0); o.location = (ex + 0 * e, ty + 0.13, 0.22)
    o = box(M['black'], 0.28, 1.5, 0.06, ex, ty, 0.03, bev=0.01)
    o = box(M['black'], 0.28, 1.5, 0.06, ex, ty, 0.38, bev=0.01)
    for e in (-0.75, 0.75):
        o = cyl(M['black'], 0.18, 0.28, name='idler'); o.rotation_euler = (0, math.pi / 2, 0); o.location = (ex - 0.14, ty + e, 0.22)
    for k in range(12):
        box(M['metal'], 0.3, 0.04, 0.02, ex, ty - 0.68 + k * 0.124, 0.43, bev=0)
# turntable + body
cyl(M['dark'], 0.45, 0.12, ex, ey, 0.44, 32)
box(M['yellow'], 1.05, 1.0, 0.55, ex + 0.15, ey, 0.56, bev=0.05)
box(M['dark'], 1.07, 1.02, 0.06, ex + 0.15, ey, 0.56, bev=0.01)
# cab
box(M['yellow'], 0.45, 0.48, 0.42, ex - 0.12, ey - 0.25, 1.1, bev=0.04)
box(M['window'], 0.02, 0.38, 0.25, ex - 0.35, ey - 0.25, 1.24, bev=0)
box(M['window'], 0.36, 0.02, 0.25, ex - 0.12, ey - 0.5, 1.24, bev=0)
box(M['glow_white'], 0.03, 0.12, 0.05, ex - 0.36, ey - 0.4, 1.45, bev=0)
box(M['glow_white'], 0.03, 0.12, 0.05, ex - 0.36, ey - 0.1, 1.45, bev=0)
# radiator + exhaust + beacon
grille(M['dark'], 0.7, 0.35, ex + 0.25, ey + 0.51, 0.68, slats=6)
cyl(M['dark'], 0.04, 0.35, ex + 0.5, ey + 0.3, 1.1, 8)
cyl(M['orange'], 0.06, 0.08, ex + 0.15, ey + 0.2, 1.11, 12)
sphere(M['glow_orange'], 0.05, ex + 0.15, ey + 0.2, 1.23, 10, 6)
# counterweight
box(M['dark'], 0.3, 0.8, 0.4, ex + 0.75, ey, 0.6, bev=0.04)
# boom reaching west/south-west into the pit
pivot = Vector((ex - 0.35, ey, 0.95))
tip = Vector((PX - 0.25, PY + 0.55, 0.45))
d = tip - pivot
L = d.length
heading = math.atan2(d.y, d.x)
pitch = math.asin(d.z / L)
# box-girder boom made of a lattice
side_n = Vector((-math.sin(heading), math.cos(heading), 0)) * 0.18
for s in (-1, 1):
    a = pivot + side_n * s
    b = tip + side_n * s
    strut(M['yellow'], a, b, 0.035, 8, 'boom_chord')
    strut(M['yellow'], a + Vector((0, 0, 0.25)), b + Vector((0, 0, 0.15)), 0.03, 8, 'boom_chord')
    n = 7
    for k in range(n):
        p0 = a + d * (k / n)
        p1 = a + d * ((k + 1) / n)
        strut(M['yellow'], p0, p1 + Vector((0, 0, 0.25 - 0.1 * (k + 1) / n)), 0.015, 5, 'boom_diag')
        strut(M['yellow'], p0, p0 + Vector((0, 0, 0.25 - 0.1 * k / n)), 0.015, 5, 'boom_vert')
# boom conveyor belt
o = cbox(M['black'], L * 0.92, 0.24, 0.03, *(pivot + d * 0.5 + Vector((0, 0, 0.12))), rz=heading, ry=-pitch)
# hoist cables from an A-frame
af = Vector((ex - 0.05, ey, 1.65))
strut(M['yellow'], Vector((ex - 0.2, ey - 0.25, 0.95)), af, 0.03, 6, 'aframe')
strut(M['yellow'], Vector((ex - 0.2, ey + 0.25, 0.95)), af, 0.03, 6, 'aframe')
strut(M['metal'], af, tip + Vector((0, 0, 0.2)), 0.008, 4, 'cable')
strut(M['metal'], af, pivot + d * 0.5 + Vector((0, 0, 0.25)), 0.008, 4, 'cable')
# bucket wheel (spinning), axis across the boom
def bucket_wheel():
    import bmesh
    parts = []
    hub = cyl(M['dark'], 0.08, 0.3, 0, 0, -0.15, 16, name='wheel_hub')
    parts.append(hub)
    for r in (-0.11, 0.11):
        parts.append(torus(M['yellow'], 0.36, 0.025, 0, 0, r, seg=32, rseg=6, name='wheel_rim'))
    for i in range(8):
        a = TAU * i / 8
        c, s = math.cos(a), math.sin(a)
        parts.append(strut(M['yellow'], (c * 0.08, s * 0.08, 0), (c * 0.35, s * 0.35, 0), 0.02, 5, 'spoke'))
        bk = cbox(M['metal'], 0.16, 0.12, 0.22, c * 0.42, s * 0.42, 0, rz=a, name='bucket', bev=0.02)
        parts.append(bk)
        parts.append(cbox(M['dark'], 0.04, 0.14, 0.24, c * 0.5, s * 0.5, 0, rz=a + 0.4, name='tooth'))
    return parts
parts = bucket_wheel()
# merge the wheel parts into one spinning object positioned at the boom tip
import bpy
bpy.context.view_layer.update()
wheel = _merge(parts, 'spin_bucket_wheel')
for p in parts:
    bpy.data.objects.remove(p, do_unlink=True)
_state['col'].objects.link(wheel)
wheel.rotation_mode = 'XYZ'
# wheel axis = local Z → horizontal across the boom
wheel.rotation_euler = (math.pi / 2, 0, heading)
wheel.location = tip + Vector((0, 0, 0.0))
mark_spin(wheel, 1.6)
cyl(M['dark'], 0.06, 0.5, 0, 0, 0, 10, rot=(math.pi / 2, 0, heading), name='wheel_axle').location = tip - Vector((-math.sin(heading), math.cos(heading), 0)) * 0.25

# --- Truss conveyor to the sorting plant --------------------------------------------------
c0 = Vector((ex - 0.2, ey + 0.55, 0.75))
c1 = Vector((-1.2, 1.0, 2.05))
cd = c1 - c0
ch = math.atan2(cd.y, cd.x)
cn = Vector((-math.sin(ch), math.cos(ch), 0)) * 0.16
for s in (-1, 1):
    strut(M['offwhite'], c0 + cn * s, c1 + cn * s, 0.025, 6, 'conv_chord')
    strut(M['offwhite'], c0 + cn * s - Vector((0, 0, 0.18)), c1 + cn * s - Vector((0, 0, 0.18)), 0.025, 6, 'conv_chord')
n = 9
for k in range(n + 1):
    p = c0 + cd * (k / n)
    for s in (-1, 1):
        strut(M['offwhite'], p + cn * s, p + cn * s - Vector((0, 0, 0.18)), 0.012, 4, 'conv_vert')
    if k < n:
        q = c0 + cd * ((k + 1) / n)
        strut(M['offwhite'], p + cn - Vector((0, 0, 0.18)), q + cn, 0.01, 4, 'conv_diag')
        strut(M['offwhite'], p - cn - Vector((0, 0, 0.18)), q - cn, 0.01, 4, 'conv_diag')
    # rollers
    o = tube(M['metal'], 0.025, 0.3, *(p + Vector((0, 0, 0.02))), heading=ch + math.pi / 2, seg=8)
pitch_c = math.asin(cd.z / cd.length)
cbox(M['black'], cd.length, 0.26, 0.02, *(c0 + cd * 0.5 + Vector((0, 0, 0.05))), rz=ch, ry=-pitch_c)
# loose regolith on the belt
for k in range(8):
    p = c0 + cd * ((k + 0.5) / 8) + Vector((0, 0, 0.09))
    sphere(M['regolith'], 0.07, *p, 7, 5, scale=(1.3, 1, 0.6), name='load')
# support bents
for t in (0.35, 0.7):
    p = c0 + cd * t
    for s in (-1, 1):
        strut(M['offwhite'], (p.x + cn.x * s, p.y + cn.y * s, 0.06), p + cn * s - Vector((0, 0, 0.18)), 0.025, 6, 'bent')
    box(M['concrete'], 0.5, 0.2, 0.08, p.x, p.y, 0.06, rz=ch + math.pi / 2, bev=0.01)

# --- Sorting plant (north-west) ---------------------------------------------------------------
sx, sy = -1.55, 1.4
# legs + platform
for dx in (-0.7, 0.7):
    for dy in (-0.6, 0.6):
        box(M['dark'], 0.1, 0.1, 1.2, sx + dx, sy + dy, 0.06, bev=0.01)
        cyl(M['concrete'], 0.1, 0.06, sx + dx, sy + dy, 0.06, 10)
for dx in (-0.7, 0.7):
    strut(M['dark'], (sx + dx, sy - 0.6, 0.2), (sx + dx, sy + 0.6, 1.1), 0.02, 5, 'xbrace')
    strut(M['dark'], (sx + dx, sy + 0.6, 0.2), (sx + dx, sy - 0.6, 1.1), 0.02, 5, 'xbrace')
box(M['metal'], 1.65, 1.45, 0.06, sx, sy, 1.26, bev=0.01)
# sorting house
box(M['yellow'], 1.4, 1.15, 0.85, sx, sy + 0.05, 1.32, bev=0.04)
corrugated(M['yellow'], 1.2, 0.7, sx, sy - 0.53, 1.38, pitch=0.1, depth=0.025)
box(M['dark'], 1.46, 1.21, 0.08, sx, sy + 0.05, 2.17, bev=0.02)
box(M['window'], 0.5, 0.02, 0.22, sx + 0.3, sy - 0.54, 1.75, bev=0)
box(M['glow_orange'], 0.5, 0.03, 0.04, sx - 0.3, sy - 0.54, 2.0, bev=0)
# feed hopper on the roof (receives the conveyor)
lathe(M['dark'], [(0.12, 0.0), (0.45, 0.4), (0.48, 0.45), (0.48, 0.5)], sx + 0.35, sy - 0.1, 2.2, seg=4, name='hopper').rotation_euler = (0, 0, math.pi / 4)
# vibrating screen deck (tilted) beside the house
o = cbox(M['metal'], 0.9, 0.55, 0.05, sx - 0.3, sy - 1.0, 1.0, rx=0.0, ry=0.25, bev=0.01)
for k in range(9):
    cbox(M['dark'], 0.02, 0.55, 0.03, sx - 0.7 + k * 0.1, sy - 1.0, 1.0 + 0.25 * (0.4 - k * 0.1) * 0.0 + (k * 0.1 - 0.4) * -0.25, bev=0)
# discharge chutes
for k, (cx, cy, m) in enumerate(((sx - 0.95, sy - 0.2, M['regolith']), (sx - 0.95, sy + 0.55, M['regolith_dark']))):
    o = cbox(M['dark'], 0.25, 0.25, 0.7, cx + 0.15, cy, 0.95, ry=0.5, bev=0.01)
# output piles
def pile(m, x, y, r, h, n=1):
    lathe(m, [(0.0, h), (r * 0.25, h * 0.94), (r * 0.6, h * 0.55), (r, 0.0)], x, y, 0.05, seg=28, name='pile')
pile(M['regolith'], -2.35, 0.9, 0.55, 0.55)
pile(M['regolith_dark'], -2.35, 2.2, 0.5, 0.45)
pile(M['regolith'], -0.5, -1.0, 0.45, 0.35)
# bagged regolith bricks on pallets
for k in range(2):
    px, py = -2.0 + k * 0.8, -2.2
    box(M['wood'] if 'wood' in M else M['dark'], 0.6, 0.6, 0.08, px, py, 0.06, bev=0.01)
    for i in range(3):
        for j in range(2):
            box(M['sandbag'], 0.18, 0.28, 0.12, px - 0.2 + i * 0.2, py - 0.14 + j * 0.28, 0.14, bev=0.04)
            box(M['sandbag'], 0.18, 0.28, 0.12, px - 0.2 + i * 0.2, py - 0.14 + j * 0.28, 0.26, bev=0.04)
# control kiosk + light mast
box(M['offwhite'], 0.45, 0.4, 0.75, 0.2, 2.35, 0.06, bev=0.03)
box(M['glow_cyan'], 0.25, 0.02, 0.15, 0.2, 2.14, 0.55, bev=0)
cyl(M['metal'], 0.035, 1.8, 0.6, 2.4, 0.06, 8)
box(M['dark'], 0.3, 0.1, 0.1, 0.6, 2.35, 1.86, bev=0.01)
box(M['glow_white'], 0.26, 0.02, 0.06, 0.6, 2.29, 1.88, bev=0)

result = finish()
