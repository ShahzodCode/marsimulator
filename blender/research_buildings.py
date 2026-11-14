"""Research buildings: Fission Reactor, Megadigger, Hematite Strip Mine,
Glacier Mine, Deep Aquifer Drill, Big Dome, Lava-Tube Habitat.

Run after mars_lib.py (see its docstring). 1 unit = 1 grid cell, +X east, +Y north, +Z up,
centred on the footprint; foundations go below ground. Each model exports to
public/models/<type>.glb. The Research Lab has its own script: blender/research_lab.py."""
import math
import random
from mathutils import Vector

SOLAR_CELL = mat('solar_cell', '#1d3b78', 0.35, 0.22)
PLANT = mat('plant_green', '#4fae46', 0.0, 0.8)
PLANT_DARK = mat('plant_dark', '#2e7a33', 0.0, 0.85)
WATER = mat('water_blue', '#3c8fd8', 0.2, 0.3)
ICE = mat('ice_blue', '#bfe7ff', 0.0, 0.15, emit='#163a52', strength=0.4)
ROCK = mat('basalt_rock', '#5c4038', 0.0, 0.95)
ORE = mat('hematite_ore', '#8e3b23', 0.1, 0.9)
INGOT = mat('iron_ingot', '#b9c2cc', 0.9, 0.3)


def pad(M, w, d, round_=False):
    if round_:
        cyl(M['concrete'], max(w, d) / 2, 0.75, 0, 0, -0.65, seg=48)
    else:
        box(M['concrete'], w, d, 0.75, 0, 0, -0.65, bev=0.05)


def fission_reactor():
    begin('fission_reactor')
    M = library()
    pad(M, 6.0, 6.0)
    box(M['pad'], 5.6, 5.6, 0.12, 0, 0, 0.0, bev=0.02)
    for x, y in ((-1.35, -1.35), (1.35, -1.35), (-1.35, 1.35), (1.35, 1.35)):
        # Reactor core can, half buried in a regolith berm for shielding.
        lathe(M['regolith'], [(0.0, 0.5), (0.9, 0.48), (1.15, 0.2), (1.25, 0.0)], x, y, 0.1, seg=32)
        cyl(M['dark'], 0.55, 1.6, x, y, 0.5, seg=24)
        cyl(M['yellow'], 0.6, 0.12, x, y, 1.4, seg=24)
        # Radiator panels in a cross (radiators dump the waste heat).
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            box(M['panel'], 0.9, 0.04, 1.4, x + math.cos(a) * 0.95, y + math.sin(a) * 0.95, 0.6, rz=a, bev=0.01)
            box(M['copper'], 0.85, 0.05, 0.05, x + math.cos(a) * 0.95, y + math.sin(a) * 0.95, 1.95, rz=a, bev=0)
        cyl(M['glow_cyan'], 0.3, 0.06, x, y, 2.1, seg=20)
    # Control hut and warning lights.
    box(M['white'], 1.0, 1.0, 0.9, 0, 0, 0.12, bev=0.06)
    box(M['yellow'], 1.04, 1.04, 0.1, 0, 0, 0.95, bev=0.02)
    for x, y in ((-2.7, -2.7), (2.7, -2.7), (-2.7, 2.7), (2.7, 2.7)):
        cyl(M['metal'], 0.04, 1.2, x, y, 0.1, seg=6)
        sphere(M['glow_orange'], 0.08, x, y, 1.35, 8, 6)
    for i in range(4):
        pipe(M['metal'], [(0, 0, 0.5), (((i % 2) * 2 - 1) * 1.35, ((i // 2) * 2 - 1) * 1.35, 0.5)], r=0.05)
    return finish()


def megadigger():
    begin('megadigger')
    M = library()
    pad(M, 7.8, 7.8)
    lathe(M['regolith_dark'], [(0.0, 0.03), (1.2, 0.03), (1.8, 0.2), (2.2, 0.05)], -2.2, 0, 0.06, seg=40)
    # Crawler tracks.
    for side in (-1, 1):
        box(M['black'], 4.6, 0.9, 0.6, 0.6, side * 1.7, 0.1, bev=0.15)
        for k in range(10):
            box(M['metal'], 0.08, 0.95, 0.04, -1.5 + k * 0.45, side * 1.7, 0.7, bev=0)
    # Body, cab and counterweight.
    box(M['yellow'], 3.6, 2.6, 1.4, 0.8, 0, 0.7, bev=0.1)
    box(M['dark'], 3.64, 2.64, 0.1, 0.8, 0, 0.7, bev=0.02)
    box(M['yellow'], 1.2, 1.1, 0.9, 1.9, -0.7, 2.1, bev=0.08)
    box(M['window'], 0.03, 0.9, 0.5, 1.29, -0.7, 2.3, bev=0)
    box(M['dark'], 1.0, 2.0, 0.9, 2.6, 0.5, 2.1, bev=0.08)
    sphere(M['glow_orange'], 0.1, 1.9, -0.7, 3.1, 10, 6)
    # Boom reaching west with the bucket wheel.
    strut(M['yellow'], (0.0, 0.3, 2.0), (-3.0, 0.3, 2.9), r=0.18, seg=10)
    strut(M['yellow'], (0.0, -0.3, 2.0), (-3.0, -0.3, 2.9), r=0.18, seg=10)
    wheel_c = Vector((-3.3, 0, 2.9))
    o = torus(M['yellow'], 1.5, 0.12, wheel_c.x, wheel_c.y, wheel_c.z, rot=(math.pi / 2, 0, 0), seg=40, rseg=8, name='spin_wheel_rim')
    mark_spin(o, 0.8)
    for k in range(10):
        a = k * math.tau / 10
        b = cbox(M['dark'], 0.45, 0.6, 0.35, wheel_c.x + math.cos(a) * 1.5, wheel_c.y, wheel_c.z + math.sin(a) * 1.5, ry=-a, name='spin_bucket')
        mark_spin(b, 0.8)
    # Conveyor down to a growing pile.
    strut(M['metal'], (1.0, 1.3, 1.4), (2.8, 3.2, 0.6), r=0.1)
    lathe(M['regolith'], [(0.0, 0.9), (0.4, 0.8), (0.9, 0.4), (1.2, 0.0)], 3.0, 3.1, 0.06, seg=24)
    return finish()


def strip_mine():
    begin('strip_mine')
    M = library()
    # Terraced pit dug into a hematite field.
    for i in range(4):
        r0 = 4.3 - i * 0.9
        lathe(ORE if i % 2 else M['regolith_dark'], [(r0 - 0.9, -0.05 - i * 0.18), (r0, -0.05 - i * 0.18), (r0, -i * 0.18 + 0.1)], 0, 0, 0, seg=48)
    cyl(ORE, 0.8, 0.05, 0, 0, -0.75, seg=32)
    random.seed(7)
    for _ in range(14):
        a = random.random() * math.tau
        r = random.uniform(1.0, 3.5)
        sphere(ORE, random.uniform(0.08, 0.18), math.cos(a) * r, math.sin(a) * r, -0.3, 8, 5, scale=(1, 1, 0.6))
    # Scraper vehicle on a terrace.
    box(M['yellow'], 1.4, 0.8, 0.6, 1.6, -1.2, -0.35, bev=0.08)
    box(M['dark'], 0.5, 0.6, 0.5, 2.0, -1.2, 0.25, bev=0.05)
    box(M['metal'], 0.15, 1.0, 0.4, 0.8, -1.2, -0.35, bev=0.02)
    # Roasting kiln (turns ore straight into iron) and ingot stacks.
    tube(M['dark'], 0.55, 2.6, -2.6, 3.0, 1.0, heading=0.0, pitch=0.12, seg=24)
    torus(M['orange'], 0.57, 0.06, -3.4, 3.0, 0.9, rot=(0, math.pi / 2, 0), seg=24, rseg=6)
    torus(M['orange'], 0.57, 0.06, -1.8, 3.0, 1.1, rot=(0, math.pi / 2, 0), seg=24, rseg=6)
    cyl(M['glow_orange'], 0.42, 0.04, -3.9, 3.0, 0.85, rot=(0, math.pi / 2, 0), seg=20)
    for x in (-3.4, -1.8):
        box(M['dark'], 0.3, 0.9, 0.5, x, 3.0, 0.0, bev=0.03)
    for i in range(3):
        for j in range(2):
            box(INGOT, 0.5, 0.22, 0.14, 2.2 + i * 0.55, 3.3 + j * 0.3, 0.02, bev=0.02)
    strut(M['metal'], (1.4, -1.0, 0.2), (-1.6, 2.6, 1.4), r=0.08)
    return finish()


def glacier_mine():
    begin('glacier_mine')
    M = library()
    pad(M, 6.8, 6.8, True)
    # Exposed ice face around the shaft.
    lathe(ICE, [(0.0, 0.05), (1.6, 0.05), (2.3, 0.25), (2.7, 0.08)], 0, 0, 0.06, seg=40)
    cyl(M['white'], 1.3, 2.0, 0, 0, 0.1, seg=32, bev=0.04)
    torus(M['teal'], 1.32, 0.08, 0, 0, 1.0, seg=40, rseg=8)
    cyl(M['dark'], 0.5, 0.5, 0, 0, 2.1, seg=24)
    # Hot-water drill rig.
    for a, x, y in polar(3, 0.9, 0.3):
        strut(M['metal'], (x, y, 2.1), (0, 0, 4.4), r=0.06)
    cyl(M['metal'], 0.1, 4.6, 0, 0, 0.1, seg=10)
    sphere(M['glow_cyan'], 0.16, 0, 0, 4.6, 12, 8)
    # Heated water tanks with insulation bands.
    for a, x, y in polar(4, 2.6, 0.4):
        cyl(WATER, 0.45, 1.6, x, y, 0.1, seg=24)
        torus(M['white'], 0.46, 0.04, x, y, 0.6, seg=24, rseg=6)
        torus(M['white'], 0.46, 0.04, x, y, 1.2, seg=24, rseg=6)
        pipe(M['metal'], [(x * 0.8, y * 0.8, 0.9), (x * 0.5, y * 0.5, 0.9)], r=0.05)
    return finish()


def deep_aquifer_drill():
    begin('deep_aquifer_drill')
    M = library()
    pad(M, 7.8, 7.8)
    box(M['dark'], 3.2, 3.2, 0.6, 0, 0, 0.1, bev=0.06)
    # Tall drilling derrick.
    H = 8.5
    for x, y in ((-1.2, -1.2), (1.2, -1.2), (-1.2, 1.2), (1.2, 1.2)):
        strut(M['orange'], (x, y, 0.7), (x * 0.25, y * 0.25, H), r=0.07)
    for k in range(1, 9):
        z = 0.7 + k * (H - 0.7) / 9
        w = 2.4 * (1 - (z - 0.7) / (H - 0.7) * 0.75)
        for a in range(4):
            ang = a * math.pi / 2
            box(M['metal'], w, 0.05, 0.05, math.cos(ang) * w / 2, math.sin(ang) * w / 2, z, rz=ang + math.pi / 2, bev=0)
    cyl(M['metal'], 0.12, H - 0.5, 0, 0, 0.7, seg=10)
    box(M['dark'], 0.8, 0.8, 0.5, 0, 0, H, bev=0.05)
    sphere(M['glow_red'], 0.13, 0, 0, H + 0.65, 10, 6)
    # Drill pipe racks, pump house, brine tanks.
    for i in range(6):
        tube(M['metal'], 0.07, 2.6, -2.9, -1.0 + i * 0.18, 0.25, heading=math.pi / 2, seg=8)
    box(M['white'], 2.0, 1.4, 1.3, 2.6, -2.4, 0.1, bev=0.08)
    box(M['teal'], 2.04, 1.44, 0.12, 2.6, -2.4, 1.3, bev=0.02)
    for x in (2.2, 3.3):
        cyl(WATER, 0.5, 1.8, x, 2.6, 0.1, seg=24)
    pipe(M['metal'], [(0.6, 0.6, 0.6), (2.2, 2.2, 0.6), (2.2, 2.6, 0.6)], r=0.08)
    return finish()


def big_dome():
    begin('big_dome')
    M = library()
    pad(M, 11.8, 11.8, True)
    ring(M['pad'], 4.6, 5.8, 0.06, 0, 0, 0.0, seg=64)
    cyl(M['white'], 4.9, 0.6, 0, 0, 0.06, seg=64, bev=0.05)
    torus(M['orange'], 4.92, 0.12, 0, 0, 0.62, seg=64, rseg=8)
    # Glass dome with metal ribs, gardens and homes inside.
    dome(M['glass'], 4.7, 0, 0, 0.66, seg=56, rings=16, sz=0.72)
    for k in range(10):
        a = k * math.pi / 10
        torus(M['metal'], 4.72, 0.04, 0, 0, 0.66, rot=(math.pi / 2, 0, a), seg=48, rseg=5, arc=math.pi, name='rib')
    random.seed(4)
    for _ in range(26):
        a = random.random() * math.tau
        r = random.uniform(0.8, 3.6)
        sphere(PLANT if random.random() < 0.6 else PLANT_DARK, random.uniform(0.25, 0.5), math.cos(a) * r, math.sin(a) * r, 0.9, 10, 6, scale=(1, 1, 0.8))
    for a, x, y in polar(6, 2.4, 0.2):
        box(M['white'], 0.9, 0.9, 0.9, x, y, 0.66, rz=a, bev=0.08)
        box(M['warm_window'], 0.4, 0.02, 0.3, x + math.cos(a) * 0.46, y + math.sin(a) * 0.46, 1.0, rz=a + math.pi / 2, bev=0)
    cyl(WATER, 0.9, 0.08, 0, 0, 0.66, seg=32)
    # Airlocks on four sides.
    for k in range(4):
        a = k * math.pi / 2
        x, y = math.cos(a) * 5.2, math.sin(a) * 5.2
        box(M['panel'], 1.2, 1.2, 1.2, x, y, 0.06, rz=a, bev=0.08)
        box(M['glow_white'], 0.6, 0.02, 0.06, x + math.cos(a) * 0.61, y + math.sin(a) * 0.61, 1.0, rz=a + math.pi / 2, bev=0)
    return finish()


def lava_habitat():
    begin('lava_habitat')
    M = library()
    # A rocky mound with a collapsed skylight opening into the lava tube.
    lathe(ROCK, [(0.0, 1.5), (1.5, 1.5), (2.3, 1.3), (4.0, 0.7), (5.0, 0.0), (5.0, -0.7)], 0, 0, 0, seg=48)
    lathe(M['regolith_dark'], [(1.4, 1.52), (1.75, 1.45), (1.6, 0.6), (1.4, 0.2)], 0, 0, 0, seg=40)
    cyl(M['dark'], 1.5, 0.05, 0, 0, 0.2, seg=40)
    random.seed(11)
    for _ in range(18):
        a = random.random() * math.tau
        r = random.uniform(2.2, 4.6)
        sphere(ROCK, random.uniform(0.15, 0.4), math.cos(a) * r, math.sin(a) * r, 1.5 - r * 0.3, 7, 5, scale=(1.2, 1, 0.6))
    # Lights and a lift shaft down the skylight; habitat modules glow below.
    for a, x, y in polar(8, 1.25):
        sphere(M['glow_white'], 0.07, x, y, 0.45, 8, 6)
    for a, x, y in polar(3, 0.7, 0.5):
        box(M['white'], 0.6, 0.6, 0.5, x, y, 0.22, bev=0.05)
        box(M['warm_window'], 0.3, 0.02, 0.2, x, y - 0.31, 0.4, bev=0)
    cyl(M['metal'], 0.08, 2.0, 0, 0, 0.2, seg=8)
    box(M['dark'], 0.5, 0.5, 0.3, 0, 0, 2.0, bev=0.03)
    # Entrance portal and pressurised tunnel on the south side.
    tube(M['white'], 0.55, 2.4, 0, -4.4, 0.6, heading=math.pi / 2, seg=24)
    box(M['panel'], 1.6, 1.0, 1.3, 0, -5.0, 0.0, bev=0.08)
    box(M['orange'], 1.64, 1.04, 0.12, 0, -5.0, 1.3, bev=0.02)
    box(M['glow_white'], 0.9, 0.02, 0.4, 0, -5.52, 0.6, bev=0)
    for x in (-1.1, 1.1):
        box(SOLAR_CELL, 1.4, 0.9, 0.05, x * 2.5, -4.0, 0.7, rx=0.5, bev=0.01)
    return finish()


result = [f() for f in (fission_reactor, megadigger, strip_mine, glacier_mine, deep_aquifer_drill, big_dome, lava_habitat)]
