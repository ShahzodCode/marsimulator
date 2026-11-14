"""Pipeline Pump Station — 4×4 cells.

Pipelines leave a base in whatever direction the other base lies, and they start at the
station's centre (Logistics.pumpSpot). So the heart of the station is a round MANIFOLD
HUB with a ribbed seal band all the way round at exactly the height and size of the pipeline
modules (blender/pipeline.py, drawn 1.5× in the game): any pipe, from any direction, ends
in a flanged port instead of an open end.

Around it, kept low (under ~1.1 cells) so an outgoing pipe never cuts through them:
  * two canned pump units (motor + volute) feeding the hub through gate valves,
  * a pressure accumulator sphere (smooths pressure surges — water hammer),
  * a low control house with a radiator, dust-filter grille and status lights,
  * a heater/heat-exchanger block for the heat-trace loop.

Run (Blender MCP, or headless — see blender/pipeline.py):
    exec(open(r'<project>/blender/mars_lib.py').read(), globals())
    exec(open(r'<project>/blender/pump_station.py').read(), globals())
"""
import math
from mathutils import Vector

# Pipeline module dimensions × the game's 1.5 drawing scale (LogisticsView MODEL_SCALE / cell).
S = 1.5
PIPE_Z = 1.1 * S        # 1.65
R_PIPE = 0.3 * S        # 0.45 jacket
R_PORT = 0.4 * S        # 0.6 flange

begin('pump_station')
M = library()
JACKET = mat('pipe_jacket', '#dcd9d2', 0.35, 0.38)
ARMOUR = mat('pipe_armour', '#5b636e', 0.75, 0.3)
CERAMIC = mat('pipe_ceramic', '#efece6', 0.0, 0.6)
STATUS = mat('pipe_status', '#000000', 0, 1, emit='#5ff3ff', strength=4.0)

# --- Pad -------------------------------------------------------------------------------------
box(M['pad'], 4, 4, 0.71, 0, 0, -0.65, bev=0.05)
box(M['concrete'], 3.8, 3.8, 0.02, 0, 0, 0.06, bev=0)
# Hazard edge around the hub plinth.
ring(M['yellow'], 1.2, 1.32, 0.015, 0, 0, 0.075, seg=40)

# --- Manifold hub ------------------------------------------------------------------------------
HUB_R = 0.95
cyl(M['concrete'], 1.15, 0.22, 0, 0, 0.06, 32, name='plinth')
# Lower drum (pumps feed in here), port ring, upper drum, dome.
cyl(ARMOUR, HUB_R, PIPE_Z - 0.62 - 0.28, 0, 0, 0.28, 32, name='hub_low')
# Universal seal band: a ribbed, flexible boot all the way round at pipe height. Whichever
# way the pipeline leaves, it pushes into this band and is sealed — no open pipe end.
prof = [(HUB_R, PIPE_Z - 0.62)]
for k in range(13):
    prof.append((HUB_R + (0.16 if k % 2 else 0.1), PIPE_Z - 0.56 + 1.12 * k / 12))
prof.append((HUB_R, PIPE_Z + 0.62))
lathe(JACKET, prof, 0, 0, 0, seg=48, name='seal_band')
# Bolt rings above and below the port band.
for zz in (PIPE_Z - 0.6, PIPE_Z + 0.6):
    torus(ARMOUR, HUB_R + 0.16, 0.045, 0, 0, zz, seg=48, rseg=6, name='clamp_ring')
    for a, cx, cy in polar(24, HUB_R + 0.2):
        cyl(M['metal'], 0.025, 0.05, cx, cy, zz - 0.025, 6, name='bolt')
cyl(ARMOUR, HUB_R, 0.35, 0, 0, PIPE_Z + 0.62, 32, name='hub_high')
# Glowing flow ring (same material as the pipe strip, so the game can recolour it later).
lathe(STATUS, [(HUB_R + 0.005, PIPE_Z + 0.75), (HUB_R + 0.005, PIPE_Z + 0.82)], 0, 0, 0, seg=48, name='status_ring')
dome(JACKET, HUB_R, 0, 0, PIPE_Z + 0.97, seg=32, rings=8, sz=0.45, name='hub_dome')
# Rotating flow meter on top (spins while it runs) and an antenna mast.
cyl(M['dark'], 0.2, 0.18, 0, 0, PIPE_Z + 1.36, 16, name='meter_base')
fan(M['alu'], M['dark'], 0.28, 0, 0, PIPE_Z + 1.56, blades=4, spin=2.5, name='spin_flowmeter')
cyl(M['metal'], 0.025, 0.9, 0.55, 0.35, PIPE_Z + 1.1, 6, name='mast')
sphere(M['glow_green'], 0.06, 0.55, 0.35, PIPE_Z + 2.02, seg=10, rings=6)
# Ladder and a small top rail for inspection robots / crew.
ladder(M['alu'], 0, -HUB_R - 0.2, 0.28, PIPE_Z + 0.65, rz=0, w=0.3)

# --- Pump units (west side) ------------------------------------------------------------------
def pump_unit(y):
    # Skid
    box(M['dark'], 1.3, 0.62, 0.08, -1.25, y, 0.06, bev=0.01)
    # Electric motor (finned) + coupling + pump volute.
    tube(M['white'], 0.2, 0.62, -1.55, y, 0.42, seg=16, name='motor')
    for k in range(7):
        tube(M['panel'], 0.225, 0.025, -1.8 + k * 0.08, y, 0.42, seg=16, name='fin')
    tube(M['orange'], 0.21, 0.04, -1.22, y, 0.42, seg=16, name='motor_band')
    tube(M['metal'], 0.07, 0.12, -1.16, y, 0.42, seg=8, name='coupling')
    lathe(ARMOUR, [(0.0, -0.15), (0.26, -0.15), (0.3, -0.05), (0.3, 0.05), (0.26, 0.15), (0.0, 0.15)], -0.95, y, 0.42, seg=20, name='volute', rot=(0, math.pi / 2, 0))
    # Discharge: up out of the volute, gate valve with handwheel, into the hub's lower drum.
    pipe(M['metal'], [(-0.95, y, 0.42), (-0.7, y, 0.42), (-0.62, y * 0.55, 0.42), (-HUB_R + 0.05, y * 0.3, 0.42)], r=0.1, seg=10, name='discharge')
    flange(ARMOUR, 0.15, -0.72, y * 0.82, 0.42, rot=(0, math.pi / 2, 0), bolts=6, bolt_m=M['metal'], thick=0.04)
    cbox(M['yellow'], 0.14, 0.14, 0.2, -0.72, y * 0.82, 0.62, name='valve_body')
    torus(M['red'], 0.11, 0.018, -0.72, y * 0.82, 0.78, seg=16, rseg=5, name='handwheel')
    # Status light on the motor.
    sphere(M['glow_green'], 0.035, -1.55, y, 0.66, seg=8, rings=5)

for y in (-0.75, 0.75):
    pump_unit(y)
# Inlet header behind the pumps, from the base's tanks (buried, rises out of the pad).
pipe(M['metal'], [(-1.85, -1.75, -0.2), (-1.85, -1.75, 0.42), (-1.85, -0.75, 0.42), (-1.85, 0.75, 0.42)], r=0.09, seg=8, name='inlet')
for y in (-0.75, 0.75):
    tube(M['metal'], 0.08, 0.1, -1.87, y, 0.42, seg=8, name='inlet_tee')

# --- Pressure accumulator (north-east) --------------------------------------------------------
ax, ay = 1.3, 1.3
for k in range(3):
    a = math.tau * k / 3
    strut(M['dark'], (ax + math.cos(a) * 0.38, ay + math.sin(a) * 0.38, 0.06), (ax + math.cos(a) * 0.2, ay + math.sin(a) * 0.2, 0.4), 0.03, 6, 'acc_leg')
sphere(M['white'], 0.42, ax, ay, 0.72, seg=24, rings=14)
torus(M['teal'], 0.425, 0.025, ax, ay, 0.72, seg=32, rseg=6, name='acc_band')
pipe(M['metal'], [(ax - 0.3, ay - 0.3, 0.42), (0.75, 0.75, 0.42), (HUB_R * 0.62, HUB_R * 0.62, 0.42)], r=0.08, seg=8, name='acc_line')
cyl(M['metal'], 0.04, 0.08, ax, ay, 1.12, 8, name='relief_valve')
cyl(M['red'], 0.06, 0.03, ax, ay, 1.18, 8, name='relief_cap')

# --- Control house (south-east) ---------------------------------------------------------------
hx, hy = 1.2, -1.25
box(M['white'], 1.2, 1.0, 0.62, hx, hy, 0.06, bev=0.04)
box(M['teal'], 1.24, 1.04, 0.06, hx, hy, 0.68, bev=0.02)
box(M['window'], 0.5, 0.02, 0.18, hx - 0.15, hy - 0.51, 0.36, bev=0)
box(STATUS, 0.5, 0.015, 0.03, hx - 0.15, hy - 0.52, 0.58, bev=0)
grille(M['dark'], 0.3, 0.28, hx + 0.32, hy - 0.52, 0.18, slats=5)
# Dust-proof door with a light above.
box(M['panel'], 0.02, 0.34, 0.5, hx - 0.61, hy, 0.06, bev=0)
sphere(M['glow_white'], 0.04, hx - 0.63, hy, 0.6, seg=8, rings=5)
# Roof radiator panel (sheds the pumps' heat into the thin air by radiation).
box(M['alu'], 0.9, 0.7, 0.03, hx, hy, 0.78, rx=math.radians(-8), bev=0)
for k in range(5):
    box(M['dark'], 0.86, 0.02, 0.03, hx, hy - 0.28 + k * 0.14, 0.81, rx=math.radians(-8), bev=0)
# Power cable to the hub (buried conduit cover).
box(M['dark'], 0.7, 0.14, 0.05, 0.55, -0.85, 0.06, rz=math.radians(40), bev=0.01)

# --- Heat-trace heater (south-west corner) ----------------------------------------------------
box(ARMOUR, 0.6, 0.45, 0.5, -1.45, -1.55, 0.06, bev=0.03)
for k in range(5):
    box(M['copper'], 0.02, 0.4, 0.4, -1.65 + k * 0.1, -1.55, 0.12, bev=0)
pipe(M['orange'], [(-1.15, -1.5, 0.35), (-0.7, -0.95, 0.35), (-0.55, -0.7, 0.9), (-0.66, -0.66, PIPE_Z - 0.62)], r=0.045, seg=8, name='heat_trace')

# --- Bollards and lights at the corners -------------------------------------------------------
for x, y in ((1.85, 0.2), (-0.2, 1.85), (0.2, -1.85)):
    cyl(M['yellow'], 0.05, 0.35, x, y, 0.06, 8, name='bollard')
    sphere(M['glow_orange'], 0.04, x, y, 0.44, seg=8, rings=5)

print(finish())
