"""Inter-base pipeline modules — repeated thousands of times along a pipeline, so each one is
kept low-poly. Four GLBs, all with the pipe axis along +X at height PIPE_Z:

  pipe_span       one straight 4-cell span (x = 0 … 4), flanged at both ends
  pipe_support    H-frame support with a sliding shoe, centred on x = 0 (after the
                  Trans-Alaska Pipeline's vertical support members, S37)
  pipe_expansion  anchor + bellows expansion joint, centred on x = 0
  pipe_buckled    a span that has been twisted and bowed sideways (thermal buckle or
                  marsquake damage); same length as pipe_span

Design (see docs/sources.md S35–S39 and src/data/logistics.ts PIPE_DESIGN):
  * inner pressure line of Ti-6Al-4V, wrapped in aerogel insulation and an armoured,
    faceted outer jacket that keeps UV, dust and micrometeorites off it;
  * an electric heat-trace line and a power/data cable tray run along the pipe;
  * the pipe rests on PTFE sliding shoes so it can grow ~0.8 m per km between the cold
    night and the warm afternoon, and bellows joints soak up the rest;
  * a glowing status strip (material `pipe_status`) shows the flow — the game recolours it.

Run (Blender MCP, or headless):
    exec(open(r'<project>/blender/mars_lib.py').read(), globals())
    exec(open(r'<project>/blender/pipeline.py').read(), globals())
"""
import math
from mathutils import Vector

L = 4.0          # span length (cells)
PIPE_Z = 1.1     # pipe axis height above the ground
R_JACKET = 0.3   # outer armour jacket
R_RIB = 0.34     # armour bands
R_FLANGE = 0.4

M = library()
JACKET = mat('pipe_jacket', '#dcd9d2', 0.35, 0.38)
ARMOUR = mat('pipe_armour', '#5b636e', 0.75, 0.3)
CERAMIC = mat('pipe_ceramic', '#efece6', 0.0, 0.6)
STATUS = mat('pipe_status', '#000000', 0, 1, emit='#5ff3ff', strength=4.0)
ALARM = mat('pipe_alarm', '#000000', 0, 1, emit='#ff3b2f', strength=7.0)
PTFE = mat('ptfe_shoe', '#f3f1ea', 0.0, 0.25)


def faceted_tube(m, r, x0, x1, sides=12, name='jacket'):
    """A many-sided (faceted) tube along +X — reads as armour, costs few triangles."""
    return lathe(m, [(r, 0.0), (r, x1 - x0)], x0, 0, PIPE_Z, seg=sides, name=name, rot=(0, math.pi / 2, 0))


def chamfer_band(m, r_in, r_out, w, x, sides=12, name='band'):
    """Armour band: a short faceted ring with chamfered edges."""
    c = w * 0.25
    return lathe(m, [(r_in, -w / 2), (r_out, -w / 2 + c), (r_out, w / 2 - c), (r_in, w / 2)], x, 0, PIPE_Z, seg=sides, name=name, rot=(0, math.pi / 2, 0))


def pipe_end(x, outward):
    """Bolted flange pair where two spans meet."""
    s = 1 if outward > 0 else -1
    lathe(ARMOUR, [(R_JACKET, 0), (R_FLANGE, 0.03), (R_FLANGE, 0.12), (R_JACKET, 0.15)], x - s * 0.15 if s > 0 else x, 0, PIPE_Z, seg=16, name='flange', rot=(0, math.pi / 2, 0))
    for i in range(8):
        a = math.tau * (i + 0.5) / 8
        tube(M['metal'], 0.025, 0.2, x - s * 0.075, math.cos(a) * 0.36, PIPE_Z + math.sin(a) * 0.36, seg=6, name='bolt')


def span_body(straight=True):
    faceted_tube(JACKET, R_JACKET, 0.0, L, 12)
    # Armour bands every half cell; the end ones are the flanges.
    for i in range(1, 8):
        chamfer_band(ARMOUR, R_JACKET - 0.01, R_RIB, 0.1, i * 0.5)
    pipe_end(0.0, -1)
    pipe_end(L, 1)
    # Status strip along the crown (glows with the flow).
    box(STATUS, L - 0.4, 0.06, 0.02, L / 2, 0, PIPE_Z + R_JACKET + 0.005, bev=0)
    for x in (0.35, L - 0.35):
        box(M['orange'], 0.12, 0.2, 0.025, x, 0, PIPE_Z + R_JACKET - 0.005, bev=0)
    # Heat-trace line (orange) and the power/data cable tray (dark) along the south side.
    tube(M['orange'], 0.045, L - 0.3, L / 2, -R_JACKET - 0.03, PIPE_Z - 0.12, seg=8, name='heat_trace')
    box(M['dark'], L - 0.3, 0.12, 0.06, L / 2, -R_JACKET - 0.08, PIPE_Z - 0.26, bev=0.01)
    for i in range(1, 8):
        box(M['dark'], 0.03, 0.12, 0.12, i * 0.5, -R_JACKET - 0.05, PIPE_Z - 0.2, bev=0)
    # Inspection hatch with a tiny green "sensor OK" light.
    box(CERAMIC, 0.32, 0.03, 0.18, L / 2 - 0.25, R_JACKET + 0.005, PIPE_Z, bev=0.005)
    sphere(M['glow_green'], 0.025, L / 2 - 0.05, R_JACKET + 0.03, PIPE_Z + 0.05, seg=8, rings=5)


# ------------------------------------------------------------------------- straight span
begin('pipe_span')
span_body()
print(finish())


# ------------------------------------------------------------------------- support
begin('pipe_support')
# Two vertical support members sunk into the ground (they go 0.6 under so uneven ground never shows a gap).
for y in (-0.55, 0.55):
    cyl(M['dark'], 0.07, 1.4, 0, y, -0.6, 10, name='vsm')
    cyl(ARMOUR, 0.12, 0.08, 0, y, -0.02, 10, name='footing')
    # Heat-pipe radiator caps (on Earth they keep permafrost frozen; here they hold the ground ice steady).
    cyl(M['alu'], 0.03, 0.55, 0, y, 0.78, 6, name='heat_pipe')
    for k in range(4):
        box(M['alu'], 0.14, 0.01, 0.05, 0, y, 1.06 + k * 0.07, rz=k * math.pi / 4, bev=0)
# Crossbeam and sliding shoe: the pipe rests on a PTFE pad and can slide along the beam.
box(M['yellow'], 0.22, 1.36, 0.16, 0, 0, 0.62, bev=0.02)
box(PTFE, 0.7, 0.5, 0.05, 0, 0, 0.7, bev=0.01)
box(ARMOUR, 0.6, 0.42, 0.06, 0, 0, 0.75, bev=0.01)
# Saddle clamp around the pipe (open on top).
torus(ARMOUR, R_JACKET + 0.05, 0.035, 0, 0, PIPE_Z, rot=(-math.pi / 2, 0, math.pi / 2), seg=16, rseg=6, arc=math.pi, name='clamp')
for sx in (-0.18, 0.18):
    torus(ARMOUR, R_JACKET + 0.04, 0.025, sx, 0, PIPE_Z, rot=(-math.pi / 2, 0, math.pi / 2), seg=12, rseg=5, arc=math.pi, name='clamp')
box(ARMOUR, 0.5, 0.1, 0.32, 0, R_JACKET + 0.04, PIPE_Z - 0.18, bev=0.01)
box(ARMOUR, 0.5, 0.1, 0.32, 0, -R_JACKET - 0.04, PIPE_Z - 0.18, bev=0.01)
# Seismic dampers (diagonal) from the feet to the beam.
for y in (-0.55, 0.55):
    for sx in (-1, 1):
        strut(M['metal'], (sx * 0.5, y, 0.0), (0, y * 0.6, 0.55), 0.025, 6, 'damper')
        cyl(M['orange'], 0.04, 0.12, sx * 0.25, y * 0.8, 0.22, 8, name='damper_body')
print(finish())


# ------------------------------------------------------------------------- expansion joint
begin('pipe_expansion')
# Heavy anchor block of sintered regolith.
box(M['concrete'], 1.3, 1.4, 1.2, 0, 0, -0.55, bev=0.05)
box(ARMOUR, 1.1, 1.1, 0.12, 0, 0, 0.62, bev=0.02)
for y in (-0.5, 0.5):
    box(M['dark'], 0.16, 0.16, 0.6, 0, y, 0.6, bev=0.02)
    box(M['yellow'], 0.18, 0.18, 0.06, 0, y, 1.22, bev=0.01)
# Bellows: corrugated metal rings that let the pipe grow and shrink without bending.
prof = []
n = 11
for i in range(n + 1):
    prof.append((R_JACKET + (0.1 if i % 2 else 0.02), -0.55 + 1.1 * i / n))
lathe(M['metal'], prof, 0, 0, PIPE_Z, seg=16, name='bellows', rot=(0, math.pi / 2, 0))
for x in (-0.6, 0.6):
    lathe(ARMOUR, [(R_JACKET, -0.06), (R_FLANGE + 0.04, -0.04), (R_FLANGE + 0.04, 0.04), (R_JACKET, 0.06)], x, 0, PIPE_Z, seg=16, name='collar', rot=(0, math.pi / 2, 0))
# Tie-rods across the bellows (limit how far it can stretch) and guide rails.
for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
    y, z = math.cos(a) * 0.46, PIPE_Z + math.sin(a) * 0.46
    tube(M['alu'], 0.022, 1.3, 0, y, z, seg=6, name='tie_rod')
# Amber beacon and a strain-gauge box.
cyl(M['dark'], 0.03, 0.4, 0, 0.5, 1.28, 6, name='beacon_post')
sphere(M['glow_orange'], 0.06, 0, 0.5, 1.72, seg=10, rings=6)
box(CERAMIC, 0.24, 0.12, 0.2, 0.3, -0.48, 1.0, bev=0.01)
box(STATUS, 0.14, 0.01, 0.04, 0.3, -0.545, 1.04, bev=0)
print(finish())


# ------------------------------------------------------------------------- buckled (twisted) span
begin('pipe_buckled')
# The pipe bows sideways and lifts (a classic thermal/seismic buckle) while the jacket twists.
def bow(t):
    s = math.sin(math.pi * t)
    return Vector((t * L, 0.55 * s * s * (1 if t < 0.5 else 0.85), PIPE_Z + 0.22 * math.sin(math.pi * t) ** 3))

pts = [bow(i / 24) for i in range(25)]
pipe(JACKET, pts, r=R_JACKET, seg=12, name='buckled_jacket')
pipe_end(0.0, -1)
pipe_end(L, 1)
# Armour bands follow the bend; some have cracked off.
for i in range(1, 8):
    t = i / 8
    p = bow(t)
    d = (bow(t + 0.01) - bow(t - 0.01)).normalized()
    heading = math.atan2(d.y, d.x)
    pitch = math.asin(max(-1, min(1, d.z)))
    if i in (4, 5):
        # Split band with a hot crack line.
        o = torus(ALARM, R_RIB, 0.02, p.x, p.y, p.z, rot=(0, math.pi / 2, heading), seg=16, rseg=4, arc=math.pi * 1.3, name='crack')
        continue
    tube(ARMOUR, R_RIB, 0.1, p.x, p.y, p.z, heading=heading, pitch=pitch, seg=12, name='band')
# The status strip is now a twisted helix (the jacket has rotated around the pipe).
helix = []
for i in range(41):
    t = i / 40
    p = bow(t)
    a = math.pi / 2 + 1.6 * math.pi * (t ** 1.5)
    helix.append(p + Vector((0, math.cos(a) * (R_JACKET + 0.02), math.sin(a) * (R_JACKET + 0.02))))
pipe(ALARM, helix, r=0.03, seg=6, name='twisted_strip')
# The heat trace has torn loose and droops.
pipe(M['orange'], [(0.2, -0.36, PIPE_Z - 0.12), (1.2, -0.3, PIPE_Z - 0.3), (2.0, -0.1, 0.35), (2.6, -0.05, 0.25), (3.2, -0.28, PIPE_Z - 0.35), (3.8, -0.36, PIPE_Z - 0.12)], r=0.04, seg=8, name='torn_trace')
# Venting frost where the jacket split, and warning beacons on stakes.
for k, (x, y, z) in enumerate([(2.0, 0.55, PIPE_Z + 0.55), (2.25, 0.65, PIPE_Z + 0.7), (1.8, 0.62, PIPE_Z + 0.8)]):
    sphere(M['white'], 0.1 + 0.04 * k, x, y, z, seg=8, rings=5, scale=(1.4, 1.0, 0.8))
for x in (0.9, 3.1):
    cyl(M['yellow'], 0.025, 0.9, x, 1.0, 0, 6, name='stake')
    sphere(ALARM, 0.07, x, 1.0, 0.95, seg=10, rings=6)
# A knocked-over support member lying on the ground.
strut(M['dark'], (2.2, -0.9, 0.05), (2.9, -0.2, 0.25), 0.07, 8, 'fallen_vsm')
box(M['yellow'], 0.22, 1.1, 0.16, 2.0, -0.6, 0.1, rz=0.6, bev=0.02)
print(finish())
