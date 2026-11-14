"""Research Lab — 7×6 cells (replaces the simple box version in research_buildings.py).

A small science campus around a central hub:
  * HUB: octagonal two-storey core with lit windows and a glass observation cupola
    holding a telescope;
  * WEST WING: pressurised geology module (a horizontal cylinder like a habitat module),
    with ribs, a window strip and a sandbag berm of regolith on its north side
    for radiation shielding;
  * EAST WING: glass-vaulted biology clean room with benches, plant trays and lab lights;
  * SOUTH: airlock with two suitports (spacesuits docked on the outside wall), a sealed
    sample glovebox with a rack of sample tubes, and a small sample rover;
  * NORTH: radiator panels that shed the lab's waste heat;
  * ROOF: weather mast with a spinning anemometer and a comms dish.

Run (Blender MCP, or headless — see blender/pipeline.py):
    exec(open(r'<project>/blender/mars_lib.py').read(), globals())
    exec(open(r'<project>/blender/research_lab.py').read(), globals())
"""
import math
import random

random.seed(7)
begin('research_lab')
M = library()
PLANT = mat('plant_green', '#4fae46', 0.0, 0.8)
PLANT_DARK = mat('plant_dark', '#2e7a33', 0.0, 0.85)
SUIT = mat('suit_white', '#f2f0ea', 0.0, 0.7)
VISOR = mat('visor_gold', '#c9962e', 1.0, 0.15)
SOLAR_CELL = mat('solar_cell', '#1d3b78', 0.35, 0.22)

# --- Pad ----------------------------------------------------------------------------------------
box(M['concrete'], 6.9, 5.9, 0.71, 0, 0, -0.65, bev=0.05)
box(M['pad'], 6.7, 5.7, 0.02, 0, 0, 0.06, bev=0)
# Walkway from the airlock to the south edge, with hazard edging.
box(M['dark'], 1.0, 1.0, 0.015, -0.4, -2.35, 0.075, bev=0)
for x in (-0.92, 0.12):
    box(M['yellow'], 0.05, 1.0, 0.016, x, -2.35, 0.077, bev=0)

# --- Hub ----------------------------------------------------------------------------------------
HX, HY = -0.4, 0.4
OCT = math.pi / 8   # rotate the octagon so a flat face points south
cyl(M['dark'], 1.3, 0.24, HX, HY, 0.06, 8, rot=(0, 0, OCT), name='hub_skirt')
cyl(M['white'], 1.15, 1.95, HX, HY, 0.3, 8, rot=(0, 0, OCT), name='hub_wall')
cyl(M['teal'], 1.19, 0.12, HX, HY, 1.15, 8, rot=(0, 0, OCT), name='hub_band')
cyl(M['teal'], 1.19, 0.1, HX, HY, 2.2, 8, rot=(0, 0, OCT), name='hub_band')
cyl(M['offwhite'], 1.15, 0.28, HX, HY, 2.3, 8, r2=0.82, rot=(0, 0, OCT), name='hub_roof')
# Lit windows on every facet but the airlock and the two wing joints (two floors).
for k in range(8):
    a = k * math.pi / 4 - math.pi / 2          # k = 0 faces south
    if k in (0, 2, 6):
        continue
    d = 1.07
    x, y = HX + math.cos(a) * d, HY + math.sin(a) * d
    for z in (0.6, 1.5):
        box(M['dark'], 0.56, 0.03, 0.44, x, y, z - 0.03, rz=a + math.pi / 2, bev=0)
        box(M['window'], 0.48, 0.035, 0.36, x, y, z, rz=a + math.pi / 2, bev=0)
        box(M['warm_window'], 0.4, 0.04, 0.05, x, y, z + 0.27, rz=a + math.pi / 2, bev=0)
# Observation cupola with a telescope inside.
ring(M['dark'], 0.62, 0.8, 0.08, HX, HY, 2.58, seg=32)
dome(M['glass'], 0.72, HX, HY, 2.62, seg=28, rings=8)
for a in range(4):
    torus(M['dark'], 0.72, 0.025, HX, HY, 2.62, rot=(math.pi / 2, 0, a * math.pi / 4), seg=24, rseg=5, arc=math.pi, name='cupola_frame')
cyl(M['metal'], 0.08, 0.3, HX, HY, 2.66, 10, name='scope_mount')
tube(M['white'], 0.11, 0.75, HX + 0.15, HY + 0.1, 3.08, heading=0.6, pitch=0.75, seg=14, name='telescope')
tube(M['dark'], 0.12, 0.08, HX + 0.4, HY + 0.28, 3.34, heading=0.6, pitch=0.75, seg=14, name='scope_lens_ring')

# --- West wing: geology module --------------------------------------------------------------------
WY, WZ, WR = HY, 1.0, 0.82
x0, x1 = -3.25, HX - 0.95
L = x1 - x0
tube(M['white'], WR, L, (x0 + x1) / 2, WY, WZ, seg=28, name='geo_module')
lathe(M['white'], [(WR, 0), (WR * 0.95, 0.18), (WR * 0.72, 0.36), (WR * 0.38, 0.47), (0, 0.5)], x0, WY, WZ, seg=28, rot=(0, -math.pi / 2, 0), name='geo_endcap')
for k in range(5):
    torus(M['dark'], WR + 0.01, 0.04, x0 + 0.15 + k * (L - 0.3) / 4, WY, WZ, rot=(0, math.pi / 2, 0), seg=28, rseg=6, name='geo_rib')
box(M['window'], L - 0.6, 0.02, 0.2, (x0 + x1) / 2, WY - WR + 0.06, WZ + 0.05, rx=math.radians(-12), bev=0)
box(M['glow_cyan'], L - 0.7, 0.02, 0.03, (x0 + x1) / 2, WY - WR + 0.02, WZ - 0.22, bev=0)
for x in (x0 + 0.4, x1 - 0.4):
    box(M['dark'], 0.25, 1.3, 0.2, x, WY, 0.06, bev=0.02)
    box(M['dark'], 0.18, 0.9, 0.12, x, WY, 0.26, bev=0.01)
# Regolith sandbag berm on the north side (radiation shielding), stacked up the module's flank.
for row in range(8):
    z = 0.14 + row * 0.19
    yy = WY + WR + 0.5 - row * 0.1 - (0.1 if row > 5 else 0)
    n = 8 - (row % 2)
    for i in range(n):
        x = x0 + 0.18 + (i + 0.5 * (row % 2)) * (L - 0.25) / 8
        sphere(M['sandbag'], 0.2, x, yy, z, seg=10, rings=6, scale=(1.1, 0.9, 0.62))
# Weather mast with a spinning anemometer (like a rover's weather booms).
mx, my = x0 + 0.5, WY - 0.2
cyl(M['metal'], 0.035, 1.25, mx, my, WZ + WR - 0.05, 8, name='wx_mast')
box(M['alu'], 0.4, 0.04, 0.04, mx, my, WZ + WR + 0.85, bev=0)
box(M['white'], 0.1, 0.08, 0.08, mx + 0.2, my, WZ + WR + 0.81, bev=0.01)
fan(M['alu'], M['dark'], 0.18, mx, my, WZ + WR + 1.2, blades=3, spin=7.0, name='spin_anemometer')
# Comms dish on the module's back.
dx, dy, dz = x1 - 0.6, WY + 0.25, WZ + WR - 0.05
cyl(M['dark'], 0.06, 0.4, dx, dy, dz, 8, name='dish_post')
lathe(M['white'], [(0.0, 0.0), (0.14, 0.02), (0.28, 0.08), (0.32, 0.1)], dx, dy + 0.05, dz + 0.42, seg=24, rot=(math.radians(-55), 0, 0), name='dish')
strut(M['metal'], (dx, dy + 0.05, dz + 0.42), (dx, dy - 0.17, dz + 0.58), 0.012, 5, 'dish_feed')
sphere(M['glow_green'], 0.03, dx, dy - 0.17, dz + 0.59, seg=8, rings=5)

# --- Tunnels from the hub to both wings -----------------------------------------------------------
tube(M['panel'], 0.5, 0.35, HX - 1.05, HY, 1.0, seg=20, name='west_tunnel')
EX0, EX1, EY, EZ, ER = 0.95, 3.3, 0.25, 0.42, 1.05
tube(M['panel'], 0.48, EX0 - (HX + 1.0) + 0.15, (HX + 1.0 + EX0) / 2, EY + 0.1, 0.85, seg=20, name='east_tunnel')

# --- East wing: glass-vault biology clean room ---------------------------------------------------
box(M['white'], EX1 - EX0, 2 * ER + 0.1, 0.36, (EX0 + EX1) / 2, EY, 0.06, bev=0.03)
box(M['concrete'], EX1 - EX0 - 0.1, 2 * ER - 0.05, 0.02, (EX0 + EX1) / 2, EY, EZ - 0.01, bev=0)
PANELS = 8
w = 2 * ER * math.sin(math.pi / PANELS / 2) + 0.01
for k in range(PANELS):
    a = (k + 0.5) * math.pi / PANELS
    cbox(M['glass'], EX1 - EX0, w, 0.02, (EX0 + EX1) / 2, EY + ER * math.cos(a) * 0.985, EZ + ER * math.sin(a) * 0.985, rx=a - math.pi / 2, name='vault_glass')
for k in range(5):
    x = EX0 + 0.05 + k * (EX1 - EX0 - 0.1) / 4
    torus(M['dark'], ER, 0.035, x, EY, EZ, rot=(math.pi / 2, 0, math.pi / 2), seg=20, rseg=5, arc=math.pi, name='vault_arch')
box(M['dark'], EX1 - EX0, 0.05, 0.05, (EX0 + EX1) / 2, EY, EZ + ER - 0.03, bev=0)
# Glass end wall (east) — the lower half sinks into the plinth.
cyl(M['glass'], ER, 0.02, EX1, EY, EZ, 24, rot=(0, math.pi / 2, 0), name='vault_end')
# Inside: two lab benches with instruments, plant trays and hanging lights.
for y in (EY - 0.45, EY + 0.45):
    box(M['offwhite'], 1.8, 0.4, 0.04, 2.15, y, EZ + 0.38, bev=0.01)
    for x in (1.35, 2.95):
        box(M['dark'], 0.04, 0.36, 0.38, x, y, EZ, bev=0)
for i, x in enumerate((1.5, 1.95, 2.4, 2.85)):
    y = EY - 0.45
    box(M['dark'], 0.32, 0.3, 0.06, x, y, EZ + 0.42, bev=0.01)
    for j in range(3):
        cyl(PLANT if (i + j) % 2 else PLANT_DARK, 0.06, 0.12 + 0.05 * j, x - 0.09 + j * 0.09, y + 0.03 * (j - 1), EZ + 0.48, 6, name='sprout')
box(M['white'], 0.3, 0.25, 0.22, 1.6, EY + 0.45, EZ + 0.42, bev=0.02)           # microscope cabinet
cyl(M['dark'], 0.04, 0.18, 1.6, EY + 0.45, EZ + 0.64, 8, name='microscope')
cyl(M['metal'], 0.16, 0.14, 2.2, EY + 0.45, EZ + 0.42, 16, name='centrifuge')
box(M['window'], 0.36, 0.2, 0.3, 2.8, EY + 0.45, EZ + 0.42, bev=0.01)          # sample freezer
box(M['glow_cyan'], 0.3, 0.01, 0.03, 2.8, EY + 0.34, EZ + 0.62, bev=0)
for x in (1.6, 2.6):
    box(M['glow_white'], 0.5, 0.06, 0.03, x, EY, EZ + 0.9, bev=0)

# --- South: airlock with suitports --------------------------------------------------------------
AX, AY0, AY1 = HX, -1.9, HY - 1.05
box(M['panel'], 1.15, AY1 - AY0, 1.35, AX, (AY0 + AY1) / 2, 0.06, bev=0.06)
box(M['orange'], 1.19, AY1 - AY0 + 0.04, 0.1, AX, (AY0 + AY1) / 2, 1.41, bev=0.02)
box(M['dark'], 0.62, 0.03, 1.0, AX, AY0 - 0.01, 0.1, bev=0.02)                   # outer hatch
box(M['window'], 0.3, 0.01, 0.2, AX, AY0 - 0.03, 0.75, bev=0)
box(M['glow_white'], 0.55, 0.02, 0.05, AX, AY0 - 0.03, 1.2, bev=0)
sphere(M['glow_green'], 0.04, AX + 0.42, AY0 - 0.03, 1.0, seg=8, rings=5)
# Two spacesuits docked back-first in suitports on the west wall.
for k in range(2):
    sy = AY0 + 0.32 + k * 0.5
    sx = AX - 0.6
    box(SUIT, 0.22, 0.34, 0.5, sx - 0.12, sy, 0.55, bev=0.06)             # torso
    sphere(SUIT, 0.13, sx - 0.15, sy, 1.17, seg=12, rings=8)                # helmet
    sphere(VISOR, 0.1, sx - 0.24, sy, 1.17, seg=12, rings=8, scale=(0.6, 1, 0.9))
    for dy in (-0.1, 0.1):
        cyl(SUIT, 0.065, 0.48, sx - 0.12, sy + dy, 0.08, 8, name='leg')
        cyl(SUIT, 0.05, 0.4, sx - 0.17, sy + dy * 2.3, 0.6, 8, name='arm')
    box(M['orange'], 0.04, 0.3, 0.06, sx - 0.24, sy, 0.92, bev=0)

# --- South-west: sample glovebox and sample tube rack ----------------------------------------------
gx, gy = -2.55, -1.75
for x in (gx - 0.45, gx + 0.45):
    for y in (gy - 0.25, gy + 0.25):
        cyl(M['dark'], 0.035, 0.5, x, y, 0.06, 6, name='gb_leg')
box(M['white'], 1.1, 0.65, 0.42, gx, gy, 0.56, bev=0.03)
box(M['glass'], 1.0, 0.55, 0.02, gx, gy - 0.05, 0.99, rx=math.radians(-15), bev=0)
for x in (gx - 0.22, gx + 0.22):
    ring(M['dark'], 0.07, 0.11, 0.03, x, gy - 0.33, 0.78, seg=16, rot=(math.pi / 2, 0, 0))
    cyl(M['black'], 0.075, 0.03, x, gy - 0.31, 0.78, 12, rot=(math.pi / 2, 0, 0), name='glove')
box(M['glow_cyan'], 0.3, 0.01, 0.04, gx + 0.3, gy - 0.335, 0.62, bev=0)
# Sample tubes in a rack (sealed rock cores, like Perseverance's).
box(M['dark'], 0.7, 0.22, 0.08, gx, gy + 0.65, 0.06, bev=0.01)
for i in range(6):
    cyl(M['alu'], 0.03, 0.32, gx - 0.25 + i * 0.1, gy + 0.65, 0.14, 8, name='sample_tube')
    cyl(M['white'], 0.034, 0.04, gx - 0.25 + i * 0.1, gy + 0.65, 0.46, 8, name='tube_cap')

# --- South-east: small sample rover parked by the clean room ---------------------------------------
rx, ry = 2.3, -1.9
box(M['white'], 0.85, 0.5, 0.18, rx, ry, 0.3, bev=0.03)
box(SOLAR_CELL, 0.8, 0.46, 0.02, rx, ry, 0.49, bev=0)
for x in (rx - 0.33, rx, rx + 0.33):
    for y in (ry - 0.3, ry + 0.3):
        tube(M['black'], 0.1, 0.08, x, y, 0.16, heading=math.pi / 2, seg=12, name='wheel')
        strut(M['dark'], (x, y * 0.98 + ry * 0.02, 0.17), (x, ry + (y - ry) * 0.6, 0.32), 0.015, 5, 'rocker')
cyl(M['metal'], 0.025, 0.42, rx + 0.3, ry - 0.1, 0.5, 6, name='rover_mast')
box(M['white'], 0.16, 0.1, 0.08, rx + 0.3, ry - 0.1, 0.92, bev=0.01)
box(M['dark'], 0.02, 0.06, 0.04, rx + 0.39, ry - 0.1, 0.94, bev=0)
strut(M['metal'], (rx - 0.42, ry, 0.36), (rx - 0.68, ry - 0.08, 0.18), 0.02, 5, 'rover_arm')
cyl(M['dark'], 0.04, 0.08, rx - 0.68, ry - 0.08, 0.1, 8, name='rover_drill')

# --- North: radiator panels --------------------------------------------------------------------
for x in (0.75, 2.55):
    for px in (x - 0.75, x + 0.75):
        cyl(M['dark'], 0.03, 1.2, px, 2.6, 0.06, 6, name='rad_post')
    box(M['alu'], 1.6, 0.04, 0.9, x, 2.6, 0.3, bev=0.01)
    for k in range(7):
        box(M['dark'], 0.02, 0.05, 0.86, x - 0.66 + k * 0.22, 2.6, 0.32, bev=0)
    box(M['copper'], 1.6, 0.05, 0.05, x, 2.6, 1.22, bev=0)
pipe(M['copper'], [(HX + 0.6, HY + 0.9, 0.5), (0.2, 2.2, 0.5), (0.2, 2.55, 0.5), (3.3, 2.55, 0.5)], r=0.04, seg=8, name='coolant')

# --- Corner lights ------------------------------------------------------------------------------
for x, y in ((-3.25, -2.75), (3.25, -2.75), (-3.25, 2.75), (3.25, 2.75)):
    cyl(M['yellow'], 0.05, 0.35, x, y, 0.06, 8, name='bollard')
    sphere(M['glow_orange'], 0.04, x, y, 0.44, seg=8, rings=5)

print(finish())
