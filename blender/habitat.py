"""Habitat Dome — 8×8 cells. Pressurised home with a geodesic shell, regolith shielding,
three cylindrical wing modules (E, W, N) and an EVA airlock facing south (the plaza)."""
import math
from mathutils import Vector

begin('habitat')
M = library()

def orient(o, normal):
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized())
    return o

R = 2.6
SZ = 0.86
Z0 = 0.45
top = Z0 + R * SZ

# --- Foundation & shielding -------------------------------------------------
cyl(M['concrete'], 3.85, 0.73, 0, 0, -0.65, 64, r2=3.75, bev=0.04)
ring(M['pad'], 2.7, 3.7, 0.02, 0, 0, 0.08, 64)
for a, x, y in polar(48, 3.72):
    box(M['dark'], 0.06, 0.06, 0.05, x, y, 0.08, rz=a)
# Two rows of regolith sandbags (radiation shielding) around the drum.
for row, (rr, zz, n) in enumerate(((2.98, 0.08, 34), (2.9, 0.3, 32))):
    for i in range(n):
        a = TAU * (i + 0.5 * row) / n
        if abs(math.sin(a) + 1) < 0.18:      # gap for the south airlock
            continue
        if abs(math.cos(a) - 1) < 0.06 or abs(math.cos(a) + 1) < 0.06 or abs(math.sin(a) - 1) < 0.06:
            continue                          # gaps under the wing modules
        o = box(M['sandbag'], 0.52, 0.3, 0.23, math.cos(a) * rr, math.sin(a) * rr, zz, rz=a + math.pi / 2, bev=0.07)

# --- Drum wall + dome ------------------------------------------------------------
cyl(M['offwhite'], 2.66, Z0 - 0.08, 0, 0, 0.08, 64, bev=0.02)
for a, x, y in polar(24, 2.67):
    box(M['panel'], 0.07, 0.05, Z0 - 0.08, x, y, 0.08, rz=a + math.pi / 2, bev=0.01)
torus(M['orange'], 2.67, 0.06, 0, 0, Z0, seg=96)
dome(M['white'], R, 0, 0, Z0, seg=64, rings=16, sz=SZ)

# Geodesic frame (icosphere wireframe) over the upper shell.
import bmesh, bpy
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=3, radius=R + 0.025)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.05], context='VERTS')
bmesh.ops.delete(bm, geom=[f for f in bm.faces], context='FACES_ONLY')
for v in bm.verts:
    v.co.z *= SZ
me = bpy.data.meshes.new('geo_frame')
bm.to_mesh(me)
bm.free()
# Convert edges → struts.
for e in me.edges:
    a = me.vertices[e.vertices[0]].co
    b = me.vertices[e.vertices[1]].co
    strut(M['offwhite'], (a.x, a.y, a.z + Z0), (b.x, b.y, b.z + Z0), 0.022, 5, 'geo')
for v in me.vertices:
    o = sphere(M['panel'], 0.04, v.co.x, v.co.y, v.co.z + Z0, 6, 4, name='node')
bpy.data.meshes.remove(me)

# Window band: framed windows with warm interior light.
def ell(a, phi, lift=0.0):
    p = Vector((R * math.cos(phi) * math.cos(a), R * math.cos(phi) * math.sin(a), Z0 + R * SZ * math.sin(phi)))
    n = Vector((math.cos(phi) * math.cos(a) / R, math.cos(phi) * math.sin(a) / R, math.sin(phi) / (R * SZ))).normalized()
    return p + n * lift, n

for i in range(12):
    a = TAU * i / 12 + math.pi / 12
    p, n = ell(a, math.radians(24), 0.03)
    t = Vector((-math.sin(a), math.cos(a), 0))
    frame = cbox(M['orange'], 0.56, 0.36, 0.05, name='win_frame')
    glass = cbox(M['warm_window'], 0.46, 0.27, 0.05, name='win_glass')
    for o, lift in ((frame, 0.0), (glass, 0.015)):
        orient(o, n)
        o.rotation_mode = 'QUATERNION'
        q = Vector((0, 0, 1)).rotation_difference(n)
        # rotate so the frame's long side follows the dome tangent
        local_x = q @ Vector((1, 0, 0))
        twist = local_x.rotation_difference(t)
        o.rotation_quaternion = twist @ q
        o.location = p + n * lift
    # little sun visor above each window
    pv, nv = ell(a, math.radians(31), 0.06)
    v = cbox(M['panel'], 0.6, 0.18, 0.025, name='visor')
    q = Vector((0, 0, 1)).rotation_difference(nv)
    v.rotation_mode = 'QUATERNION'
    v.rotation_quaternion = (q @ Vector((1, 0, 0))).rotation_difference(t) @ q
    v.location = pv

# Upper ring of small portholes.
for i in range(8):
    a = TAU * i / 8
    p, n = ell(a, math.radians(52), 0.02)
    c = cyl(M['orange'], 0.14, 0.05, name='port_ring')
    g = cyl(M['window'], 0.1, 0.06, name='port_glass')
    for o in (c, g):
        orient(o, n)
        o.location = p

# --- Roof: cupola, skylight, mast ----------------------------------------------
cyl(M['offwhite'], 0.72, 0.22, 0, 0, top - 0.06, 40, bev=0.02)
torus(M['orange'], 0.72, 0.045, 0, 0, top + 0.16, seg=48)
cyl(M['dark'], 0.62, 0.08, 0, 0, top + 0.16, 40)
dome(M['glass'], 0.5, 0, 0, top + 0.24, seg=32, rings=8, sz=0.7)
for a, x, y in polar(8, 0.5):
    strut(M['alu'], (x, y, top + 0.24), (0, 0, top + 0.24 + 0.35), 0.012, 4, 'sky_rib')
cyl(M['glow_cyan'], 0.38, 0.02, 0, 0, top + 0.245, 32)
# Vent caps
for a, x, y in polar(3, 1.3, 0.4):
    _, n = ell(a, math.radians(63))
    pz = Z0 + R * SZ * math.sin(math.radians(63))
    cyl(M['metal'], 0.09, 0.22, x, y, pz - 0.05, 12)
    cyl(M['dark'], 0.14, 0.04, x, y, pz + 0.17, 12)
# Comms mast with dish and beacon
mx, my = 0.85, -0.55
mz = Z0 + R * SZ * math.sqrt(max(0, 1 - (mx * mx + my * my) / (R * R))) - 0.05
cyl(M['dark'], 0.08, 0.12, mx, my, mz, 12)
cyl(M['alu'], 0.03, 1.1, mx, my, mz + 0.1, 8)
for k in range(3):
    strut(M['alu'], (mx + 0.25 * math.cos(k * 2.1), my + 0.25 * math.sin(k * 2.1), mz), (mx, my, mz + 0.6), 0.012, 4, 'guy')
d = dome(M['white'], 0.28, 0, 0, 0, seg=24, rings=6, sz=0.35, name='dish')
d.rotation_euler = (math.radians(125), 0, math.radians(-30))
d.location = (mx + 0.1, my - 0.05, mz + 0.95)
strut(M['alu'], (mx + 0.05, my, mz + 0.9), (mx + 0.25, my - 0.18, mz + 1.08), 0.01, 4, 'feed')
sphere(M['glow_red'], 0.05, mx, my, mz + 1.24, 10, 6)
cyl(M['alu'], 0.012, 0.5, mx - 0.12, my + 0.05, mz + 0.15, 6)

# --- Wing modules (E, W, N) ---------------------------------------------------------
def wing(a):
    cx, cy = math.cos(a), math.sin(a)
    zc = 0.92
    L = 1.75
    mid = 3.0
    tube(M['white'], 0.72, L, cx * mid, cy * mid, zc, heading=a, seg=40, bev=0.0)
    # end cap
    s = sphere(M['white'], 0.72, cx * (mid + L / 2), cy * (mid + L / 2), zc, 40, 20, scale=(0.42, 1, 1), name='cap')
    s.rotation_euler = (0, 0, a)
    # ribs
    for k in range(6):
        t = -L / 2 + 0.12 + k * (L - 0.24) / 5
        torus(M['offwhite'], 0.73, 0.028, cx * (mid + t), cy * (mid + t), zc, rot=(0, math.pi / 2, a), seg=48, rseg=6)
    # docking collar at the dome
    torus(M['orange'], 0.76, 0.07, cx * (mid - L / 2 + 0.05), cy * (mid - L / 2 + 0.05), zc, rot=(0, math.pi / 2, a), seg=48, rseg=8)
    torus(M['metal'], 0.66, 0.04, cx * (mid - L / 2 - 0.05), cy * (mid - L / 2 - 0.05), zc, rot=(0, math.pi / 2, a), seg=48, rseg=6)
    # saddles
    for t in (-0.5, 0.5):
        px, py = cx * (mid + t), cy * (mid + t)
        box(M['dark'], 0.18, 1.2, 0.32, px, py, 0.08, rz=a, bev=0.02)
        box(M['metal'], 0.24, 1.0, 0.06, px, py, 0.38, rz=a, bev=0.01)
    # windows (both sides)
    nx, ny = -cy, cx
    for side in (-1, 1):
        for t in (-0.35, 0.35):
            px = cx * (mid + t) + nx * side * 0.69
            py = cy * (mid + t) + ny * side * 0.69
            for o, r, h in ((cyl(M['orange'], 0.13, 0.06, name='wwin'), 0, 0), (cyl(M['warm_window'], 0.09, 0.07, name='wwin_g'), 0, 0)):
                orient(o, (nx * side, ny * side, 0))
                o.location = (px, py, zc + 0.1)
    # top light strip + handrail
    box(M['glow_white'], 0.9, 0.06, 0.03, cx * mid, cy * mid, zc + 0.71, rz=a, bev=0)
    for side in (-1, 1):
        p0 = Vector((cx * (mid - 0.6) + nx * side * 0.45, cy * (mid - 0.6) + ny * side * 0.45, zc + 0.62))
        p1 = Vector((cx * (mid + 0.6) + nx * side * 0.45, cy * (mid + 0.6) + ny * side * 0.45, zc + 0.62))
        strut(M['yellow'], p0 + Vector((0, 0, 0.07)), p1 + Vector((0, 0, 0.07)), 0.014, 6, 'grab')
        for p in (p0, p1):
            strut(M['yellow'], p, p + Vector((0, 0, 0.07)), 0.012, 4, 'grab_post')

for a in (0.0, math.pi, math.pi / 2):
    wing(a)

# Radiator panels on the north wing roof.
for k in (-1, 1):
    o = box(M['white'], 1.4, 0.04, 0.55, 0, 3.0 + k * 0.32, 1.62, rx=k * 0.4, bev=0.005)
    for j in range(7):
        box(M['metal'], 0.03, 0.05, 0.53, -0.6 + j * 0.2, 3.0 + k * 0.32, 1.63, rx=k * 0.4, bev=0)
strut(M['metal'], (0, 2.7, 1.62), (0, 3.3, 1.62), 0.03, 8, 'rad_spine')

# --- South airlock -----------------------------------------------------------------
ay = -2.95
box(M['offwhite'], 1.5, 1.35, 1.35, 0, ay, 0.08, bev=0.05)
box(M['orange'], 1.56, 1.41, 0.14, 0, ay, 1.38, bev=0.02)
box(M['panel'], 1.3, 1.15, 0.08, 0, ay, 1.52, bev=0.02)
cyl(M['dark'], 0.12, 0.1, 0.35, ay + 0.2, 1.6, 12)
cyl(M['metal'], 0.16, 0.05, -0.35, ay + 0.2, 1.6, 16)
# door frame + door + porthole
box(M['dark'], 0.86, 0.06, 1.06, 0, ay - 0.69, 0.16, bev=0.02)
box(M['panel'], 0.7, 0.05, 0.94, 0, ay - 0.73, 0.2, bev=0.02)
o = cyl(M['window'], 0.1, 0.03, 0, ay - 0.76, 0.85, 16)
orient(o, (0, -1, 0)); o.location = (0, ay - 0.75, 0.85)
o = cyl(M['orange'], 0.13, 0.025, name='porthole_ring')
orient(o, (0, -1, 0)); o.location = (0, ay - 0.755, 0.85)
cbox(M['yellow'], 0.06, 0.04, 0.22, 0.27, ay - 0.78, 0.6, name='handle')
# hazard stripes on the threshold
for i in range(8):
    cbox(M['yellow'] if i % 2 == 0 else M['black'], 0.11, 0.3, 0.02, -0.39 + i * 0.111, ay - 0.82, 0.1, rz=0.6)
# steps
for i in range(3):
    box(M['metal'], 0.9, 0.22, 0.05 + i * 0.0, 0, ay - 0.95 + i * 0.12, 0.0 + i * 0.03 - 0.02, bev=0.01)
# lights + status
box(M['glow_white'], 0.5, 0.05, 0.04, 0, ay - 0.71, 1.18, bev=0)
sphere(M['glow_green'], 0.04, 0.5, ay - 0.71, 1.05, 8, 6)
sphere(M['glow_red'], 0.04, 0.5, ay - 0.71, 0.95, 8, 6)
# handrails on both sides of the steps
for sx in (-0.52, 0.52):
    railing(M['yellow'], [(sx, ay - 1.05, 0.04), (sx, ay - 0.72, 0.12)], h=0.55, post_every=0.3)
# suitports on the airlock sides
for sx in (-1, 1):
    o = cyl(M['dark'], 0.2, 0.05, name='suitport'); orient(o, (sx, 0, 0)); o.location = (sx * 0.77, ay, 0.85)
    box(M['white'], 0.12, 0.34, 0.42, sx * 0.86, ay, 0.62, bev=0.04)
    box(M['gold'], 0.04, 0.2, 0.18, sx * 0.93, ay, 0.75, bev=0.01)

# --- Exterior equipment ---------------------------------------------------------------
# Gas tank bundle (O2 / N2) on a cradle, north-east.
for i, (tx, ty) in enumerate(((2.35, 2.45), (2.7, 2.1))):
    tube(M['offwhite'], 0.2, 1.0, tx, ty, 0.4, heading=-math.pi / 4, seg=24)
    for e in (-0.5, 0.5):
        s = sphere(M['offwhite'], 0.2, tx + e * math.cos(-math.pi / 4), ty + e * math.sin(-math.pi / 4), 0.4, 24, 12, scale=(0.5, 1, 1), name='tank_end')
        s.rotation_euler = (0, 0, -math.pi / 4)
    for e in (-0.3, 0.3):
        torus(M['teal'] if i == 0 else M['orange'], 0.205, 0.02, tx + e * 0.707, ty - e * 0.707, 0.4, rot=(0, math.pi / 2, -math.pi / 4), seg=32, rseg=6)
for e in (-0.3, 0.3):
    box(M['dark'], 0.95, 0.12, 0.22, 2.52 + e * 0.707, 2.27 - e * 0.707, 0.08, rz=math.pi / 4, bev=0.01)
pipe(M['metal'], [(2.2, 2.2, 0.4), (1.95, 1.95, 0.4), (1.9, 1.9, 0.15), (1.85, 1.75, 0.15)], 0.03)

# Power/data conduits from the base ring.
for a in (-0.35, 0.35 + math.pi, -2.5):
    c, s = math.cos(a), math.sin(a)
    pipe(M['black'], [(c * 3.8, s * 3.8, 0.1), (c * 3.2, s * 3.2, 0.1), (c * 2.7, s * 2.7, 0.2)], 0.035)
    box(M['dark'], 0.25, 0.2, 0.3, c * 3.5, s * 3.5, 0.08, rz=a, bev=0.02)
    box(M['glow_green'], 0.03, 0.02, 0.05, c * 3.5 + s * 0.11, s * 3.5 - c * 0.11, 0.3, rz=a, bev=0)

# Supply crates by the airlock.
for (cx, cy, rz, m) in ((-1.35, -3.15, 0.2, 'orange'), (-1.25, -3.6, -0.1, 'offwhite'), (1.3, -3.4, 0.35, 'teal')):
    box(M[m], 0.4, 0.34, 0.3, cx, cy, 0.08, rz=rz, bev=0.03)
    box(M['dark'], 0.42, 0.05, 0.04, cx, cy, 0.3, rz=rz, bev=0)

result = finish()
