"""Crew rover + cargo rover — futuristic pressurized rovers after NASA's Space Exploration Vehicle
concept (S8): a streamlined cabin with a wraparound visor, suitports on the back, six wheels on
independent arms, roof solar wings and a comms mast. The cargo version keeps the cab and carries
containers and tanks on a flatbed.

+X is forward, +Z up; the game scales the model to one unit long (RoverFleet)."""
import math
import bmesh
from mathutils import Vector

SOLAR = mat('solar_cell', '#1d3b78', 0.35, 0.22)


def loft(m_hull, m_visor, sections, visor_from_x, steps=4, name='cabin'):
    """Streamlined shell through rounded-rectangle sections (x, half width, z bottom, z top, corner r).
    On the nose (x > visor_from_x) the upper half of the shell gets the visor material."""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    rings = []
    upper = []
    for x, hw, zb, zt, r in sections:
        pts = []
        zmid = zb + r + (zt - zb - 2 * r) * 0.4
        corners = [(hw - r, zt - r, 0.0, True), (-hw + r, zt - r, 0.5, True), (-hw + r, zb + r, 1.0, False), (hw - r, zb + r, 1.5, False)]
        for ci, (cy, cz, start, up) in enumerate(corners):
            for k in range(steps + 1):
                a = (start + 0.5 * k / steps) * math.pi
                pts.append(bm.verts.new((x, cy + math.cos(a) * r, cz + math.sin(a) * r)))
                if not rings:
                    upper.append(up)
            # split each straight side halfway down, so the visor edge is a clean line
            if ci in (1, 3):
                pts.append(bm.verts.new((x, -hw if ci == 1 else hw, zmid)))
                if not rings:
                    upper.append(True)
        rings.append(pts)
    n = len(rings[0])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        visor = sections[i][0] >= visor_from_x
        for j in range(n):
            f = bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))
            f.material_index = 1 if (visor and upper[j] and upper[(j + 1) % n]) else 0
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, [m_hull, m_visor])


def wheel(M, x, y, z, r=0.46, w=0.34):
    side = 1 if y > 0 else -1
    rot = (math.pi / 2, 0, 0)
    lathe(M['black'], [(r * 0.62, -w / 2), (r * 0.88, -w / 2), (r * 0.98, -w * 0.36), (r, 0), (r * 0.98, w * 0.36), (r * 0.88, w / 2), (r * 0.62, w / 2)],
          x, y, z, seg=28, rot=rot, name='tyre')
    # chevron tread blocks
    for a, cx, cz in polar(14, r * 0.985):
        cbox(M['black'], 0.1, w * 0.8, 0.05, x + cx, y, z + cz, ry=-a + math.pi / 2, name='tread')
    cyl(M['dark'], r * 0.64, w * 0.9, x, y - w * 0.45, z, 24, rot=(-math.pi / 2, 0, 0), name='rim')
    # outer hub face with spokes and a glowing ring
    hub_y = y + side * w * 0.46
    cyl(M['alu'], r * 0.36, 0.05, x, hub_y - (0.05 if side < 0 else 0), z, 20, rot=(-math.pi / 2, 0, 0), name='hub')
    for a, cx, cz in polar(5, r * 0.36):
        cbox(M['metal'], r * 0.42, 0.04, 0.06, x + cx * 0.75, hub_y, z + cz * 0.75, ry=-a, name='spoke')
    torus(M['glow_cyan'], r * 0.5, 0.014, x, hub_y + side * 0.01, z, rot=(math.pi / 2, 0, 0), seg=32, rseg=6, name='hub_glow')


def chassis(M, length, wheels_x, track):
    box(M['dark'], length, 1.3, 0.3, 0, 0, 0.5, bev=0.05, name='chassis')
    box(M['panel'], length * 0.9, 1.1, 0.06, 0, 0, 0.44, bev=0.02, name='skid')
    for x in wheels_x:
        for s in (-1, 1):
            y = s * track
            wheel(M, x, y, 0.46)
            # independent arm + shock absorber
            strut(M['dark'], (x - 0.3, s * 0.62, 0.62), (x, y - s * 0.2, 0.46), r=0.05, name='arm')
            strut(M['metal'], (x + 0.22, s * 0.62, 0.78), (x + 0.04, y - s * 0.22, 0.5), r=0.03, name='shock')
            # fender arc over the wheel
            torus(M['offwhite'], 0.56, 0.05, x, y, 0.46, rot=(math.pi / 2, 0, 0), seg=20, rseg=8, arc=math.pi, name='fender')


def cab_details(M, nose_x, rear_x, roof_z, with_suitports):
    # light bar + headlights under the visor
    box(M['glow_white'], 0.04, 0.9, 0.06, nose_x - 0.06, 0, 1.0, bev=0, name='lightbar')
    for s in (-1, 1):
        cyl(M['glow_white'], 0.07, 0.06, nose_x - 0.22, s * 0.62, 0.92, 12, rot=(0, math.pi / 2, 0), name='headlight')
    # lidar puck on the nose
    cyl(M['dark'], 0.11, 0.06, nose_x - 0.75, 0, roof_z - 0.28, 16, name='lidar_base')
    dome(M['glow_cyan'], 0.09, nose_x - 0.75, 0, roof_z - 0.22, seg=16, rings=6, name='lidar')
    # side glow stripe + orange accent near the back
    for s in (-1, 1):
        box(M['glow_cyan'], (nose_x - 0.4) - (rear_x + 0.15), 0.02, 0.035, ((nose_x - 0.4) + (rear_x + 0.15)) / 2, s * 1.0, 1.12, bev=0, name='stripe')
        box(M['orange'], 0.5, 0.02, 0.2, rear_x + 0.45, s * 1.0, 1.25, bev=0.005, name='accent')
        box(M['red'], 0.02, 0.18, 0.06, rear_x + 0.01, s * 0.7, 0.95, bev=0, name='tail_frame')
        box(M['glow_red'], 0.02, 0.14, 0.03, rear_x - 0.005, s * 0.7, 0.965, bev=0, name='tail_light')
    if with_suitports:
        # two suitports on the back wall: the crew climbs straight into suits docked outside
        for s in (-1, 1):
            torus(M['orange'], 0.27, 0.035, rear_x - 0.02, s * 0.42, 1.42, rot=(0, math.pi / 2, 0), seg=28, rseg=8, name='suitport')
            cyl(M['panel'], 0.26, 0.04, rear_x - 0.04, s * 0.42, 1.42, 24, rot=(0, -math.pi / 2, 0), name='suitport_hatch')
            # a docked suit back-pack
            box(M['white'], 0.18, 0.36, 0.48, rear_x - 0.16, s * 0.42, 1.18, bev=0.06, name='suit_pack')
            box(M['glow_green'], 0.01, 0.08, 0.03, rear_x - 0.255, s * 0.42, 1.55, bev=0, name='suit_led')
        # step plate
        box(M['metal'], 0.3, 1.4, 0.04, rear_x - 0.12, 0, 0.72, bev=0.01, name='step')


def roof(M, x0, x1, roof_z):
    box(M['panel'], x1 - x0, 1.2, 0.05, (x0 + x1) / 2, 0, roof_z - 0.02, bev=0.02, name='roof_deck')
    # two solar wings tilted outwards
    for s in (-1, 1):
        o = box(SOLAR, x1 - x0 - 0.1, 0.78, 0.03, (x0 + x1) / 2, s * 0.55, roof_z + 0.12, rx=s * 0.12, bev=0.005, name='solar')
        box(M['alu'], x1 - x0 - 0.05, 0.03, 0.05, (x0 + x1) / 2, s * 0.96, roof_z + 0.08, bev=0, name='solar_edge')
        for k in range(3):
            strut(M['metal'], (x0 + 0.2 + k * (x1 - x0 - 0.4) / 2, s * 0.3, roof_z), (x0 + 0.2 + k * (x1 - x0 - 0.4) / 2, s * 0.3, roof_z + 0.12), r=0.025, name='post')


def mast(M, x, y, base_z):
    cyl(M['metal'], 0.035, 0.75, x, y, base_z, 8, name='mast')
    lathe(M['white'], [(0.0, 0.0), (0.12, 0.02), (0.24, 0.09), (0.26, 0.1)], x, y + 0.02, base_z + 0.62, seg=20, rot=(math.radians(-60), 0, 0), name='dish')
    cyl(M['dark'], 0.03, 0.12, x, y, base_z + 0.75, 8, name='mast_cap')
    sphere(M['glow_orange'], 0.05, x, y, base_z + 0.9, 10, 6, name='beacon')
    cyl(M['gold'], 0.012, 0.5, x - 0.25, -y, base_z, 6, name='whip')


def build(cargo):
    begin('cargo_rover' if cargo else 'crew_rover')
    M = library()
    nose = 2.38
    if cargo:
        rear = 0.25
        sections = [(rear, 0.92, 0.78, 1.95, 0.3), (rear + 0.12, 1.0, 0.72, 2.05, 0.38), (1.35, 0.98, 0.74, 1.98, 0.4),
                    (1.95, 0.9, 0.8, 1.7, 0.38), (2.25, 0.75, 0.88, 1.35, 0.3), (nose, 0.55, 0.95, 1.15, 0.2)]
        roof_z = 2.05
    else:
        rear = -2.05
        sections = [(rear, 0.92, 0.78, 2.0, 0.3), (-1.9, 1.0, 0.72, 2.12, 0.38), (0.6, 1.0, 0.72, 2.12, 0.38), (1.4, 0.98, 0.74, 2.0, 0.4),
                    (1.95, 0.9, 0.8, 1.7, 0.38), (2.25, 0.75, 0.88, 1.35, 0.3), (nose, 0.55, 0.95, 1.15, 0.2)]
        roof_z = 2.12
    loft(M['white'], M['window'], sections, visor_from_x=1.3, name='cabin')
    chassis(M, 4.3, (-1.5, 0.0, 1.5), 1.12)
    cab_details(M, nose, rear, roof_z, with_suitports=not cargo)
    if cargo:
        # flatbed with a container and two tanks
        box(M['dark'], 2.3, 1.9, 0.1, -0.95, 0, 0.8, bev=0.03, name='bed')
        for s in (-1, 1):
            box(M['orange'], 2.3, 0.05, 0.08, -0.95, s * 0.95, 0.9, bev=0.01, name='bed_rail')
        box(M['offwhite'], 1.15, 1.6, 0.85, -1.4, 0, 0.9, bev=0.05, name='container')
        box(M['orange'], 1.17, 1.62, 0.12, -1.4, 0, 1.6, bev=0.02, name='container_band')
        for s in (-1, 1):
            corrugated(M['panel'], 0.95, 0.55, -1.4, s * 0.81, 1.0, rz=0 if s < 0 else math.pi, name='container_side')
        for s in (-1, 1):
            tube(M['alu'], 0.3, 0.6, -0.45, s * 0.42, 1.22, heading=0, seg=20, name='tank')
            for e in (-0.3, 0.3):
                sphere(M['alu'], 0.3, -0.45 + e, s * 0.42, 1.22, 20, 10, scale=(0.4, 1, 1), name='tank_end')
            torus(M['orange'], 0.31, 0.025, -0.45, s * 0.42, 1.22, rot=(0, math.pi / 2, 0), seg=24, rseg=6, name='tank_band')
            box(M['dark'], 0.12, 0.7, 0.32, -0.45, s * 0.42, 0.9, bev=0.02, name='tank_cradle')
        sphere(M['glow_orange'], 0.06, rear + 0.05, 0.75, roof_z + 0.02, 10, 6, name='cargo_beacon')
        roof(M, rear + 0.35, 1.25, roof_z)
        mast(M, rear + 0.25, -0.6, roof_z)
    else:
        # side windows
        for s in (-1, 1):
            for k, (x0, x1) in enumerate([(-1.45, -0.75), (-0.6, 0.1), (0.25, 0.85)]):
                box(M['window'], x1 - x0, 0.03, 0.3, (x0 + x1) / 2, s * 1.0, 1.42, bev=0.01, name='side_window')
                if k == 1:
                    box(M['warm_window'], x1 - x0 - 0.08, 0.02, 0.22, (x0 + x1) / 2, s * 1.012, 1.46, bev=0, name='side_glow')
        # rear equipment pod + roof hatch
        box(M['offwhite'], 0.6, 1.3, 0.35, -1.55, 0, roof_z - 0.02, bev=0.06, name='roof_pod')
        grille(M['dark'], 0.5, 0.2, -1.55, 0.66, roof_z + 0.06, rz=math.pi, slats=5)
        ring(M['orange'], 0.24, 0.3, 0.05, 0.85, 0, roof_z - 0.02, seg=32, name='roof_hatch')
        roof(M, -1.15, 0.6, roof_z)
        mast(M, -1.55, 0.45, roof_z + 0.33)
        # folded robotic arm on the nose (for sampling)
        strut(M['dark'], (1.55, -0.85, 0.95), (2.05, -0.75, 1.15), r=0.045, name='arm1')
        strut(M['dark'], (2.05, -0.75, 1.15), (1.75, -0.72, 1.3), r=0.04, name='arm2')
        sphere(M['yellow'], 0.07, 2.05, -0.75, 1.15, 12, 8, name='arm_joint')
        box(M['metal'], 0.12, 0.1, 0.12, 1.7, -0.72, 1.27, bev=0.02, name='gripper')
    return finish()


result = [build(False), build(True)]
