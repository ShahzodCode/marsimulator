"""Tier A buildings.  Blender axes: +X east, +Y north, +Z up; the front / road side is -Y (glTF +Z)."""
import math
from marslib import Model, T, R, plinth, ladder, railing, crate, barrel, fan, tank_v


# ============================================================================ battery bank (4 x 4)
def battery_bank():
    m = Model('battery_bank', 'building', (4, 4),
              notes='Six battery cabinets in two rows facing south; cable junction box on the west side, '
                    'radiator with spin_fan in the south-west corner, transformer in the south-east.')
    p = m.root
    Z = plinth(p, 3.9, 3.9)

    def cabinet(x, y):
        with p.at(x, y, Z):
            p.boxz('dark_metal', 0, 0, 0, 0.86, 0.72, 0.08, bevel=0.01)
            p.boxz('hull_white', 0, 0, 0.08, 0.82, 0.68, 1.12, bevel=0.035)
            p.boxz('trim_orange', 0, 0, 0.98, 0.835, 0.695, 0.09, bevel=0.008)
            p.boxz('hull_offwhite', 0, -0.345, 0.2, 0.66, 0.02, 0.7, bevel=0.006)
            p.boxz('dark_metal', 0.25, -0.362, 0.5, 0.03, 0.03, 0.22, bevel=0)
            for i in range(3):
                p.boxz('glow_green', -0.22 + i * 0.1, -0.362, 0.76, 0.06, 0.02, 0.06, bevel=0)
            for i in range(4):
                p.boxz('dark_metal', -0.08, -0.36, 0.28 + i * 0.075, 0.4, 0.014, 0.03, bevel=0)
            # roof: fin block + status strip
            p.boxz('dark_metal', 0, 0.03, 1.2, 0.72, 0.56, 0.04, bevel=0.01)
            for i in range(7):
                p.boxz('aluminium', -0.3 + i * 0.1, 0.03, 1.24, 0.036, 0.52, 0.15, bevel=0.008)
            p.boxz('glow_green', 0, -0.29, 1.2, 0.52, 0.035, 0.035, bevel=0)

    rows = (1.15, -0.15)
    xs = (-0.45, 0.47, 1.39)
    for yr in rows:
        for x in xs:
            cabinet(x, yr)
        yb = yr + 0.44
        for x in xs:  # short cable stubs out of each cabinet's back
            p.pipe('rubber_black', [(x, yr + 0.3, Z + 0.42), (x, yb, Z + 0.42), (x, yb, Z + 0.07)], 0.045, seg=8)
    # thick trunk cables to the junction box (west)
    p.pipe('rubber_black', [(1.39, 1.59, Z + 0.07), (-1.45, 1.59, Z + 0.07), (-1.45, 1.2, Z + 0.07)], 0.06, seg=8)
    p.pipe('rubber_black', [(1.39, 0.29, Z + 0.07), (-1.2, 0.29, Z + 0.07)], 0.06, seg=8)
    # copper bus bars linking the two rows across the roofs
    for x in xs:
        p.boxz('copper', x + 0.36, 0.53, Z + 1.21, 0.035, 1.3, 0.03, bevel=0)

    # junction box
    with p.at(-1.45, 0.5, Z):
        p.boxz('dark_metal', 0, 0, 0, 0.6, 1.5, 0.95, bevel=0.03)
        p.boxz('safety_yellow', 0, 0, 0.8, 0.615, 1.515, 0.08, bevel=0.006)
        p.boxz('hull_offwhite', 0.305, 0, 0.15, 0.02, 1.1, 0.55, bevel=0.005)
        p.boxz('glow_green', 0.32, 0.4, 0.5, 0.02, 0.08, 0.08, bevel=0)
        p.boxz('glow_orange', 0.32, 0.25, 0.5, 0.02, 0.08, 0.08, bevel=0)
        p.boxz('panel_grey', 0, 0, 0.95, 0.5, 1.4, 0.03, bevel=0.01)
        for yy in (-0.45, 0, 0.45):  # insulators
            p.cylz('hull_white', 0, yy, 0.98, 0.16, 0.05, seg=10, r2=0.035)
            for k in range(3):
                p.cylz('hull_white', 0, yy, 1.0 + k * 0.045, 0.02, 0.075, seg=10)
            p.cylz('copper', 0, yy, 1.14, 0.06, 0.02, seg=8)
        p.pipe('copper', [(0, -0.45, 1.19), (0, 0.45, 1.19)], 0.012, seg=6)

    # radiator / cooler with fan (south-west)
    with p.at(-1.3, -1.3, Z):
        p.boxz('panel_grey', 0, 0, 0, 0.95, 0.95, 0.5, bevel=0.03)
        p.boxz('trim_teal', 0, 0, 0.36, 0.965, 0.965, 0.06, bevel=0.006)
        for i in range(6):
            p.boxz('dark_metal', -0.3 + i * 0.12, -0.478, 0.08, 0.05, 0.012, 0.24, bevel=0)
        p.ring('dark_metal', 0.37, 0.43, 0.5, 0.14, seg=24)
        p.cylz('rubber_black', 0, 0, 0.5, 0.012, 0.37, seg=24)
        p.boxz('steel', 0, 0, 0.51, 0.74, 0.03, 0.02, bevel=0)
        p.boxz('steel', 0, 0, 0.51, 0.03, 0.74, 0.02, bevel=0)
    f = m.spin('spin_fan', (-1.3, -1.3, Z + 0.59), speed=3.0)
    fan(f, 0.34, n=5)
    # coolant loop
    p.pipe('copper', [(-0.85, -1.1, Z + 0.25), (-0.85, -0.63, Z + 0.25), (1.75, -0.63, Z + 0.25)], 0.035)
    p.pipe('copper', [(-1.0, -0.82, Z + 0.25), (-1.0, 0.67, Z + 0.25), (1.75, 0.67, Z + 0.25)], 0.035)

    # transformer (south-east)
    with p.at(1.15, -1.35, Z):
        p.boxz('dark_metal', 0, 0, 0, 0.7, 0.5, 0.62, bevel=0.03)
        for i in range(6):
            for sy in (-1, 1):
                p.boxz('aluminium', -0.25 + i * 0.1, sy * 0.3, 0.08, 0.03, 0.12, 0.46, bevel=0.005)
        for xx in (-0.2, 0, 0.2):
            p.cylz('hull_white', xx, 0, 0.62, 0.14, 0.045, seg=10, r2=0.03)
            p.cylz('copper', xx, 0, 0.76, 0.05, 0.016, seg=8)
        p.boxz('glow_green', 0.356, 0, 0.4, 0.012, 0.1, 0.06, bevel=0)
    p.pipe('rubber_black', [(0.8, -1.35, Z + 0.07), (0.2, -1.35, Z + 0.07), (0.2, -0.63, Z + 0.07)], 0.05, seg=8)
    # spare modules on a pallet
    p.boxz('panel_grey', 0.05, -1.5, Z, 0.6, 0.5, 0.06, bevel=0.01)
    p.boxz('hull_offwhite', -0.07, -1.5, Z + 0.06, 0.24, 0.4, 0.3, bevel=0.02)
    p.boxz('hull_offwhite', 0.2, -1.5, Z + 0.06, 0.24, 0.4, 0.3, bevel=0.02)
    p.boxz('trim_orange', -0.07, -1.5, Z + 0.36, 0.1, 0.2, 0.03, bevel=0.005)
    p.boxz('trim_orange', 0.2, -1.5, Z + 0.36, 0.1, 0.2, 0.03, bevel=0.005)
    # hazard edge + bollards
    for i in range(7):
        p.boxz('safety_yellow', -0.3 + i * 0.36, -1.76, Z, 0.22, 0.07, 0.012, bevel=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cylz('safety_yellow', sx * 1.8, sy * 1.8, Z, 0.3, 0.045, seg=10, b=0.012)
    return m


# ============================================================================ MOXIE oxygen maker (4 x 4)
def moxie_unit():
    m = Model('moxie_unit', 'building', (4, 4),
              notes='Tilted air intake with dust filter + spin_fan in the south-west, gold-foil electrolysis '
                    'core in the middle, compressor south-east, three oxygen tanks along the north edge.')
    p = m.root
    Z = plinth(p, 3.9, 3.9)

    # --- hot core ("oven")
    with p.at(0.25, 0.3, Z):
        p.boxz('dark_metal', 0, 0, 0, 1.5, 1.3, 0.12, bevel=0.02)
        p.boxz('mli_gold', 0, 0, 0.12, 1.36, 1.16, 1.1, bevel=0.07)
        for sx in (-0.4, 0.4):
            p.boxz('steel', sx, 0, 0.1, 0.06, 1.2, 1.15, bevel=0.008)
        p.boxz('steel', 0, 0, 0.62, 1.4, 1.2, 0.05, bevel=0.008)
        p.boxz('hull_white', 0, 0, 1.2, 1.2, 1.0, 0.1, bevel=0.03)
        p.boxz('dark_metal', -0.1, 0, 1.3, 0.8, 0.8, 0.025, bevel=0.005)
        for i in range(4):
            p.boxz('glow_cyan', -0.385 + i * 0.19, 0, 1.325, 0.09, 0.68, 0.012, bevel=0)
        # vent stack with a faint glow
        p.cylz('steel', 0.42, 0.28, 1.3, 0.4, 0.085, seg=12)
        p.cylz('dark_metal', 0.42, 0.28, 1.7, 0.03, 0.11, seg=12)
        p.cylz('glow_orange', 0.42, 0.28, 1.731, 0.006, 0.06, seg=12)
        p.cylz('steel', 0.42, -0.28, 1.3, 0.14, 0.07, seg=12)
        # copper heat-exchanger coil on the east face
        for k in range(6):
            p.pipe('copper', [(0.72, -0.4, 0.3 + k * 0.13), (0.72, 0.4, 0.3 + k * 0.13)], 0.03, seg=6, joints=False)
        p.pipe('copper', [(0.72, -0.4, 0.3), (0.72, -0.4, 0.95)], 0.03, seg=6)
        p.pipe('copper', [(0.72, 0.4, 0.3), (0.72, 0.4, 0.95)], 0.03, seg=6)
        # control face (south)
        p.boxz('hull_offwhite', -0.05, -0.6, 0.3, 0.5, 0.05, 0.5, bevel=0.01)
        p.boxz('glow_cyan', -0.13, -0.63, 0.55, 0.26, 0.01, 0.16, bevel=0)
        p.boxz('glow_green', 0.1, -0.63, 0.66, 0.05, 0.01, 0.05, bevel=0)
        p.boxz('trim_teal', -0.05, -0.63, 0.34, 0.44, 0.01, 0.06, bevel=0)

    # --- air intake (south-west): filter housing + tilted fan duct
    hx, hy = -1.25, -0.95
    with p.at(hx, hy, Z):
        p.boxz('hull_white', 0, 0, 0, 1.05, 1.0, 0.75, bevel=0.04)
        p.boxz('trim_teal', 0, 0, 0.56, 1.065, 1.015, 0.08, bevel=0.006)
        # pleated dust filter on the west side
        p.boxz('dark_metal', -0.54, 0, 0.1, 0.05, 0.8, 0.42, bevel=0.008)
        for i in range(9):
            p.boxz('panel_grey', -0.575, -0.32 + i * 0.08, 0.12, 0.03, 0.04, 0.38, bevel=0)
        # second filter cartridge on the south face
        p.boxz('dark_metal', 0, -0.51, 0.1, 0.8, 0.04, 0.42, bevel=0.008)
        for i in range(9):
            p.boxz('panel_grey', -0.32 + i * 0.08, -0.54, 0.12, 0.04, 0.03, 0.38, bevel=0)
    tilt = 35
    with p.at(hx, hy + 0.05, Z + 0.75, rx=tilt):
        p.lathe('hull_white', [(0.36, -0.3), (0.42, -0.3), (0.47, 0.5), (0.41, 0.5)], seg=24, close=True)
        p.ring('trim_orange', 0.4, 0.485, 0.42, 0.06, seg=24)
        p.cylz('dark_metal', 0, 0, 0.05, 0.02, 0.38, seg=24)
        p.cylz('panel_grey', 0, 0, 0.16, 0.03, 0.385, seg=24)        # filter disc
        for i in range(7):
            p.boxz('dark_metal', -0.3 + i * 0.1, 0, 0.19, 0.025, 0.7 - abs(i - 3) * 0.1, 0.006, bevel=0)
        p.boxz('steel', 0, 0, 0.455, 0.84, 0.025, 0.02, bevel=0)     # guard bars
        p.boxz('steel', 0, 0, 0.455, 0.025, 0.84, 0.02, bevel=0)
    s, c = math.sin(math.radians(tilt)), math.cos(math.radians(tilt))
    f = m.spin('spin_fan', (hx, hy + 0.05 - 0.33 * s, Z + 0.75 + 0.33 * c), rot=(tilt, 0, 0), speed=4.0)
    fan(f, 0.36, n=6)
    # duct from the intake to the core
    p.pipe('hull_offwhite', [(hx, -0.5, Z + 0.5), (hx, 0.2, Z + 0.5), (-0.43, 0.2, Z + 0.5)], 0.14, seg=12)
    p.cylz('steel', hx, 0.2, Z, 0.4, 0.04, seg=8)

    # --- compressor (south-east)
    with p.at(1.15, -1.15, Z):
        for xx in (-0.3, 0.3):
            p.boxz('dark_metal', xx, 0, 0, 0.12, 0.6, 0.26, bevel=0.01)
        p.cyl('dark_metal', (-0.5, 0, 0.5), (0.4, 0, 0.5), 0.3, seg=18)
        for xx in (-0.5, -0.05, 0.4):
            p.cyl('steel', (xx - 0.03, 0, 0.5), (xx + 0.03, 0, 0.5), 0.325, seg=18)
        p.boxz('hull_offwhite', 0.58, 0, 0.2, 0.3, 0.5, 0.55, bevel=0.03)   # motor
        p.boxz('trim_teal', 0.58, 0, 0.6, 0.31, 0.51, 0.06, bevel=0.005)
        for i in range(5):
            p.boxz('dark_metal', 0.58, -0.18 + i * 0.09, 0.75, 0.26, 0.03, 0.05, bevel=0)
        p.boxz('glow_cyan', 0.1, -0.31, 0.5, 0.16, 0.012, 0.08, bevel=0)
        p.cylz('steel', -0.2, 0, 0.78, 0.12, 0.05, seg=8)            # relief valve
        p.cylz('signal_red', -0.2, 0, 0.9, 0.02, 0.08, seg=10)
    # CO2 feed: core -> compressor, O2 line: compressor -> tank manifold
    p.pipe('copper', [(0.1, -0.33, Z + 0.22), (0.1, -1.15, Z + 0.22), (0.62, -1.15, Z + 0.22), (0.62, -1.15, Z + 0.45)], 0.05)
    p.pipe('copper', [(1.75, -0.85, Z + 0.3), (1.75, 1.08, Z + 0.3), (0.1, 1.08, Z + 0.3)], 0.045)
    p.pipe('copper', [(1.6, -1.15, Z + 0.78), (1.75, -1.15, Z + 0.78), (1.75, -0.85, Z + 0.3)], 0.045)

    # --- oxygen tanks (north)
    for i, x in enumerate((0.2, 0.9, 1.6)):
        tank_v(p, x, 1.5, Z, 0.3, 1.62, band='trim_teal', glow='glow_cyan')
        p.pipe('copper', [(x, 1.08, Z + 0.3), (x, 1.24, Z + 0.3)], 0.035, seg=6)
        p.cylz('signal_red', x, 1.08, Z + 0.36, 0.02, 0.06, seg=10)
    p.boxz('dark_metal', 0.9, 1.5, Z + 1.05, 1.9, 0.06, 0.05, bevel=0.01)   # tie bar

    # --- control cabinet + radiator (north-west)
    with p.at(-1.3, 1.3, Z):
        p.boxz('hull_white', 0, 0.1, 0, 0.8, 0.5, 1.0, bevel=0.04)
        p.boxz('trim_orange', 0, 0.1, 0.84, 0.815, 0.515, 0.07, bevel=0.006)
        p.boxz('window_dark', 0, -0.155, 0.45, 0.5, 0.012, 0.3, bevel=0)
        p.boxz('glow_cyan', -0.08, -0.163, 0.52, 0.26, 0.008, 0.12, bevel=0)
        p.boxz('glow_green', 0.17, -0.163, 0.62, 0.05, 0.008, 0.05, bevel=0)
        p.boxz('panel_grey', 0, 0.1, 1.0, 0.7, 0.4, 0.03, bevel=0.01)
        p.cylz('steel', 0.22, 0.2, 1.03, 0.5, 0.012, seg=6)
        p.sphere('glow_cyan', (0.22, 0.2, 1.55), 0.03, seg=8, rings=4)
    # radiator panel (Kilopower-style) between cabinet and intake
    with p.at(-1.45, 0.45, Z):
        p.cylz('steel', 0, 0, 0, 0.9, 0.03, seg=8)
        p.box('hull_offwhite', (0, 0, 0.75), (0.05, 0.75, 0.8), bevel=0.01)
        for k in range(5):
            p.box('copper', (0.03, 0, 0.45 + k * 0.15), (0.02, 0.7, 0.025), bevel=0)
            p.box('copper', (-0.03, 0, 0.45 + k * 0.15), (0.02, 0.7, 0.025), bevel=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cylz('safety_yellow', sx * 1.8, sy * 1.8, Z, 0.3, 0.045, seg=10, b=0.012)
    return m


# ============================================================================ central storage depot (6 x 6)
def storage_depot():
    m = Model('storage_depot', 'building', (6, 6),
              notes='Vaulted warehouse with the loading door on the south wall, crew annex on the east, '
                    'crates/bins on the south apron, robot arm (spin_arm) in the south-east, beacon on the roof ridge.')
    p = m.root
    Z = plinth(p, 5.9, 5.9)
    cx, cy = -0.5, 0.85            # hall centre
    W, D, H = 4.0, 3.5, 1.25
    p.boxz('hull_white', cx, cy, Z, W, D, H, bevel=0.04)
    p.boxz('sintered_regolith', cx, cy, Z, W + 0.1, D + 0.1, 0.16, bevel=0.02)
    p.boxz('trim_orange', cx, cy, Z + 0.92, W + 0.03, D + 0.03, 0.13, bevel=0.008)
    p.boxz('trim_teal', cx, cy, Z + 0.82, W + 0.03, D + 0.03, 0.05, bevel=0.005)
    zr = Z + H

    def arch(mat, a, b, y0, length, n=14):
        pts = [(a * math.cos(math.pi * i / n), b * math.sin(math.pi * i / n)) for i in range(n + 1)]
        with p.at(cx, y0, zr, rx=90):
            p.extrude(mat, pts, 0, length)

    yN, yS = cy + D / 2, cy - D / 2
    arch('hull_white', 2.02, 0.75, yN + 0.02, D + 0.04)
    arch('trim_orange', 2.07, 0.8, yN + 0.06, 0.14)
    arch('trim_orange', 2.07, 0.8, yS + 0.08, 0.14)
    for k in (1, 2, 3):
        arch('panel_grey', 2.05, 0.78, yN - k * D / 4 + 0.04, 0.08)
    ztop = zr + 0.75
    # ridge walkway, vents, hatch
    p.boxz('panel_grey', cx, cy, ztop - 0.02, 0.5, D - 0.5, 0.06, bevel=0.01)
    for yy in (cy + 1.0, cy - 0.2):
        p.boxz('dark_metal', cx, yy, ztop + 0.04, 0.42, 0.5, 0.16, bevel=0.02)
        for i in range(4):
            p.boxz('aluminium', cx, yy - 0.18 + i * 0.12, ztop + 0.2, 0.36, 0.06, 0.03, bevel=0.005)
    p.cylz('hull_offwhite', cx, cy + 0.4, ztop + 0.04, 0.06, 0.2, seg=14, b=0.015)
    p.cylz('trim_teal', cx, cy + 0.4, ztop + 0.1, 0.02, 0.12, seg=14)
    # skylight strips on the vault flanks
    for sgn in (-1, 1):
        for xo, ang in ((1.0, 11.8), (1.55, 21.5)):
            zz = 0.75 * math.sqrt(1 - (xo / 2.02) ** 2)
            p.box('dark_metal', (cx + sgn * xo, cy, zr + zz + 0.0), (0.3, D - 0.7, 0.03), rot=(0, sgn * ang, 0), bevel=0.005)
            for j in range(4):
                p.box('window_warm', (cx + sgn * xo, cy - 1.05 + j * 0.7, zr + zz + 0.018), (0.22, 0.55, 0.02),
                      rot=(0, sgn * ang, 0), bevel=0)
    # beacon mast on the ridge (front)
    bx, by = cx, yS + 0.45
    p.cylz('dark_metal', bx, by, ztop, 0.08, 0.12, seg=12)
    p.cylz('steel', bx, by, ztop, 0.45, 0.03, seg=8)
    p.cylz('dark_metal', bx, by, ztop + 0.45, 0.03, 0.09, seg=12)
    p.dome('glow_orange', (bx, by, ztop + 0.48), 0.075, 0.11, seg=12, rings=3)
    for a in range(4):
        with p.at(bx, by, ztop + 0.48, rz=a * 90 + 45):
            p.boxz('steel', 0.085, 0, 0, 0.012, 0.012, 0.13, bevel=0)
    p.cylz('steel', bx, by, ztop + 0.6, 0.012, 0.1, seg=10)
    # small uplink dish on the ridge (rear)
    p.cylz('steel', cx, yN - 0.35, ztop, 0.25, 0.025, seg=8)
    p.dish('hull_white', 0.28, 0.08, T(cx, yN - 0.35, ztop + 0.27) @ R(-30, 0, 0), seg=16)
    p.cyl('steel', (cx, yN - 0.35, ztop + 0.27), (cx, yN - 0.35 + 0.1, ztop + 0.44), 0.012, seg=6)

    # --- loading door (south wall)
    yd = yS
    p.boxz('trim_orange', cx, yd - 0.03, Z, 2.35, 0.12, 1.2, bevel=0.02)
    p.boxz('window_dark', cx, yd - 0.06, Z + 0.02, 2.05, 0.1, 1.06, bevel=0)
    for i in range(4):                                   # roller door, half open
        p.boxz('panel_grey', cx, yd - 0.115, Z + 1.0 - i * 0.11, 2.05, 0.03, 0.1, bevel=0.01)
    p.boxz('safety_yellow', cx, yd - 0.118, Z + 0.63, 2.05, 0.035, 0.05, bevel=0)
    for xx in (-0.6, 0, 0.6):                            # interior lamps
        p.boxz('window_warm', cx + xx, yd - 0.112, Z + 0.5, 0.3, 0.01, 0.06, bevel=0)
    for sgn in (-1, 1):
        p.boxz('glow_orange', cx + sgn * 1.26, yd - 0.1, Z + 1.0, 0.07, 0.03, 0.1, bevel=0)
        p.cylz('safety_yellow', cx + sgn * 1.3, yd - 0.3, Z, 0.35, 0.05, seg=10, b=0.012)
    for i in range(7):                                   # threshold hazard dashes
        p.boxz('safety_yellow', cx - 0.96 + i * 0.32, yd - 0.3, Z, 0.2, 0.08, 0.012, bevel=0)
    # ramp plate
    p.boxz('panel_grey', cx, yd - 0.16, Z, 2.0, 0.2, 0.03, bevel=0.008)

    # --- crew annex (east)
    ax, ay = 2.1, 1.1
    p.boxz('hull_offwhite', ax, ay, Z, 1.2, 2.2, 0.95, bevel=0.04)
    p.boxz('trim_teal', ax, ay, Z + 0.72, 1.215, 2.215, 0.1, bevel=0.006)
    p.boxz('panel_grey', ax, ay, Z + 0.95, 1.05, 2.05, 0.04, bevel=0.01)
    for yy in (0.5, 1.1, 1.7):
        p.boxz('window_warm', ax + 0.605, yy, Z + 0.42, 0.012, 0.32, 0.2, bevel=0)
    p.boxz('window_warm', ax + 0.25, ay - 1.105, Z + 0.42, 0.34, 0.012, 0.2, bevel=0)
    p.boxz('dark_metal', ax - 0.25, ay - 1.105, Z + 0.02, 0.32, 0.03, 0.62, bevel=0.01)   # door
    p.boxz('glow_green', ax - 0.25, ay - 1.12, Z + 0.68, 0.08, 0.012, 0.04, bevel=0)
    p.cylz('hull_white', ax, ay + 0.5, Z + 0.99, 0.07, 0.28, seg=16, b=0.02)             # roof hatch
    p.cylz('trim_orange', ax, ay + 0.5, Z + 1.06, 0.015, 0.16, seg=16)
    p.boxz('dark_metal', ax, ay - 0.45, Z + 0.99, 0.7, 0.8, 0.05, bevel=0.01)             # radiator
    for i in range(6):
        p.boxz('aluminium', ax, ay - 0.75 + i * 0.12, Z + 1.04, 0.62, 0.035, 0.09, bevel=0.005)
    # sandbag-like berm along the annex's north/east foot (crewed part)
    for i in range(5):
        p.sphere('regolith_bag', (ax + 0.66, 0.3 + i * 0.42, Z + 0.07), 0.2, seg=8, rings=4, sz=0.45, sx=0.6)
    p.pipe('copper', [(1.5, 2.0, Z + 1.1), (1.75, 2.0, Z + 1.1), (1.75, 2.0, Z + 0.99)], 0.035, seg=6)

    # gas bottles on the west wall
    for yy in (1.3, 1.75):
        p.capsule('steel', (-2.72, yy, Z + 0.2), (-2.72, yy, Z + 0.95), 0.16, seg=12, rings=3)
        p.cylz('trim_teal', -2.72, yy, Z + 0.6, 0.12, 0.165, seg=12)
    p.boxz('dark_metal', -2.62, 1.52, Z + 0.45, 0.06, 0.9, 0.06, bevel=0.01)

    # --- south apron: crates, bins, barrels
    crate(p, -2.2, -1.55, Z, 0.52, 'hull_offwhite', 'trim_orange', rz=4)
    crate(p, -2.2, -1.55, Z + 0.53, 0.4, 'hull_white', 'trim_teal', rz=-12)
    crate(p, -1.6, -1.6, Z, 0.44, 'panel_grey', 'trim_teal', rz=-6)
    crate(p, -2.3, -2.3, Z, 0.46, 'hull_white', 'trim_orange', rz=8)
    crate(p, -0.95, -1.45, Z, 0.42, 'hull_offwhite', 'safety_yellow', rz=0)

    def open_bin(x, y, fill):
        with p.at(x, y, Z):
            p.boxz('dark_metal', 0, 0, 0, 0.7, 0.55, 0.06, bevel=0.01)
            for sx in (-1, 1):
                p.boxz('dark_metal', sx * 0.335, 0, 0, 0.04, 0.55, 0.34, bevel=0.008)
            for sy in (-1, 1):
                p.boxz('dark_metal', 0, sy * 0.26, 0, 0.7, 0.04, 0.34, bevel=0.008)
            p.boxz('safety_yellow', 0, -0.283, 0.24, 0.7, 0.012, 0.06, bevel=0)
            if fill == 'soil':
                p.sphere('loose_regolith', (0, 0, 0.24), 0.3, seg=10, rings=4, sz=0.5, sx=1.05, sy=0.8)
            else:
                for i in range(3):
                    for j in range(2):
                        p.boxz('steel', -0.2 + i * 0.2, -0.1 + j * 0.2, 0.06 + 0.08 * ((i + j) % 2), 0.16, 0.16, 0.22, bevel=0.015)

    open_bin(-1.5, -2.45, 'soil')
    open_bin(-0.65, -2.45, 'iron')
    barrel(p, 0.15, -2.55, Z, mat='trim_teal')
    barrel(p, 0.5, -2.4, Z, mat='hull_white')
    barrel(p, 0.2, -2.2, Z, mat='trim_teal')

    # --- little maintenance robot on the apron
    with p.at(0.35, -1.45, Z, rz=20):
        p.boxz('hull_white', 0, 0, 0.08, 0.34, 0.48, 0.18, bevel=0.03)
        p.boxz('trim_orange', 0, 0, 0.2, 0.35, 0.49, 0.035, bevel=0.004)
        for sx in (-1, 1):
            for yy in (-0.15, 0.15):
                p.cyl('rubber_black', (sx * 0.17, yy, 0.08), (sx * 0.22, yy, 0.08), 0.08, seg=10)
        p.cylz('steel', 0, -0.12, 0.26, 0.14, 0.02, seg=6)
        p.boxz('hull_offwhite', 0, -0.13, 0.38, 0.16, 0.1, 0.09, bevel=0.015)
        p.boxz('glow_cyan', 0, -0.185, 0.405, 0.1, 0.01, 0.035, bevel=0)
        p.boxz('solar_blue', 0, 0.1, 0.262, 0.26, 0.22, 0.01, bevel=0)

    # --- robot arm (south-east); everything above the pedestal spins
    rx, ry = 1.8, -1.9
    p.boxz('safety_yellow', rx, ry, Z, 0.8, 0.8, 0.03, bevel=0.008)
    p.cylz('dark_metal', rx, ry, Z + 0.03, 0.24, 0.3, seg=18, b=0.02)
    a = m.spin('spin_arm', (rx, ry, Z + 0.27), speed=0.4)
    a.cylz('safety_yellow', 0, 0, 0, 0.16, 0.23, seg=18, b=0.02)
    a.boxz('dark_metal', 0, 0, 0.16, 0.2, 0.26, 0.2, bevel=0.02)
    a.cyl('steel', (0, -0.16, 0.3), (0, 0.16, 0.3), 0.07, seg=12)
    a.box('safety_yellow', (0.2, 0, 0.587), (0.7, 0.13, 0.13), rot=(0, -55, 0), bevel=0.02)
    a.cyl('steel', (0.4, -0.11, 0.873), (0.4, 0.11, 0.873), 0.075, seg=12)
    a.box('hull_white', (0.638, 0, 0.736), (0.55, 0.1, 0.1), rot=(0, 30, 0), bevel=0.02)
    a.box('trim_orange', (0.58, 0, 0.77), (0.1, 0.108, 0.108), rot=(0, 30, 0), bevel=0.005)
    a.cyl('steel', (0.876, -0.08, 0.598), (0.876, 0.08, 0.598), 0.055, seg=10)
    a.boxz('dark_metal', 0.876, 0, 0.44, 0.07, 0.07, 0.14, bevel=0.01)
    a.boxz('dark_metal', 0.876, 0, 0.41, 0.3, 0.08, 0.035, bevel=0.008)
    for sx in (-1, 1):
        a.boxz('steel', 0.876 + sx * 0.135, 0, 0.3, 0.025, 0.07, 0.12, bevel=0)
    a.boxz('hull_offwhite', 0.876, 0, 0.2, 0.24, 0.24, 0.2, bevel=0.02)     # carried crate
    a.boxz('trim_teal', 0.876, 0, 0.31, 0.25, 0.25, 0.04, bevel=0.004)
    a.sphere('glow_orange', (0, 0, 0.39), 0.035, seg=8, rings=4)
    return m


# ============================================================================ storage silo & tanks (5 x 5)
def storage_silo():
    m = Model('storage_silo', 'building', (5, 5),
              notes='Two solids bins on the west (catwalk + ladder + bucket elevator), pressurised tanks on the '
                    'east: blue-banded water spheres (north), teal oxygen capsules (middle), red-banded hydrogen (south).')
    p = m.root
    Z = plinth(p, 4.9, 4.9)

    def bin_(x, y, band):
        with p.at(x, y, Z):
            for a in range(4):
                with p.at(rz=45 + a * 90):
                    p.boxz('steel', 0.6, 0, 0, 0.07, 0.07, 1.0, bevel=0.008)
                    p.cyl('steel', (0.6, 0, 0.1), (0.42, 0.42, 0.8), 0.018, seg=6, caps=False)
            p.lathe('hull_offwhite', [(0, 0.38), (0.13, 0.38), (0.72, 0.95), (0.72, 2.4), (0.6, 2.52), (0.18, 2.68), (0, 2.68)], seg=20)
            for zz in (1.0, 1.45, 1.9, 2.36):
                p.cylz('panel_grey', 0, 0, zz, 0.045, 0.74, seg=20)
            p.cylz(band, 0, 0, 2.02, 0.22, 0.728, seg=20)
            p.boxz('dark_metal', 0, 0, 0.2, 0.22, 0.22, 0.2, bevel=0.02)     # outlet gate
            p.boxz('safety_yellow', 0, 0, 0.16, 0.3, 0.3, 0.04, bevel=0.005)
            p.cylz('dark_metal', 0, 0, 2.68, 0.07, 0.2, seg=14, b=0.015)     # fill hatch
            p.cylz('steel', 0.38, 0, 2.58, 0.12, 0.05, seg=8)                # breather
            p.cylz('dark_metal', 0.38, 0, 2.7, 0.02, 0.075, seg=8)

    bx = -1.45
    bin_(bx, 1.35, 'trim_orange')
    bin_(bx, -0.45, 'regolith_dark')
    # catwalk along the east side of the bins
    wx, wz = bx + 0.86, Z + 2.42
    p.boxz('panel_grey', wx, 0.45, wz, 0.32, 2.4, 0.035, bevel=0.008)
    p.boxz('dark_metal', wx - 0.2, 0.45, wz - 0.05, 0.12, 0.06, 0.05, bevel=0)
    for yy in (-0.45, 1.35):
        p.boxz('dark_metal', wx - 0.1, yy, wz - 0.06, 0.3, 0.08, 0.06, bevel=0.01)
        p.cyl('steel', (wx + 0.12, yy, wz), (wx - 0.14, yy, wz - 0.7), 0.02, seg=6)
    railing(p, [(wx + 0.15, -0.72, wz + 0.035), (wx + 0.15, -0.14, wz + 0.035), (wx + 0.15, 0.45, wz + 0.035),
                (wx + 0.15, 1.04, wz + 0.035), (wx + 0.15, 1.62, wz + 0.035)], h=0.3)
    railing(p, [(wx - 0.15, 1.62, wz + 0.035), (wx + 0.15, 1.62, wz + 0.035)], h=0.3)
    railing(p, [(wx - 0.15, 0.2, wz + 0.035), (wx - 0.15, 0.7, wz + 0.035)], h=0.3)
    ladder(p, wx, -0.78, Z, 2.75, w=0.22)
    for zz in (0.9, 1.7):
        p.boxz('safety_yellow', wx, -0.72, Z + zz, 0.26, 0.1, 0.02, bevel=0)
    # bucket elevator feeding the south bin
    e0, e1 = (bx, -2.1, Z + 0.25), (bx, -0.5, Z + 2.86)
    p.cyl('panel_grey', e0, e1, 0.1, seg=8)
    p.cyl('trim_orange', (bx, -1.5, Z + 1.229), (bx, -1.4, Z + 1.392), 0.108, seg=8)
    p.boxz('dark_metal', bx, -0.47, Z + 2.72, 0.26, 0.26, 0.24, bevel=0.03)
    p.cyl('steel', (bx, -1.3, Z + 1.55), (bx, -1.3, Z), 0.025, seg=6)
    with p.at(bx, -2.1, Z):                                # intake hopper with a soil heap
        p.boxz('dark_metal', 0, 0, 0, 0.6, 0.5, 0.36, bevel=0.02)
        p.boxz('safety_yellow', 0, 0, 0.28, 0.615, 0.515, 0.05, bevel=0.004)
        p.sphere('loose_regolith', (0, -0.02, 0.33), 0.26, seg=10, rings=4, sz=0.45, sx=1.0, sy=0.8)
    p.sphere('loose_regolith', (bx + 0.6, -2.15, Z), 0.3, seg=10, rings=4, sz=0.45)

    # --- water spheres (north-east), blue band
    for sx_ in (0.55, 1.75):
        with p.at(sx_, 1.6, Z):
            p.cylz('dark_metal', 0, 0, 0, 0.45, 0.36, seg=16)
            for a in range(4):
                with p.at(rz=45 + a * 90):
                    p.cyl('steel', (0.5, 0, 0), (0.4, 0, 0.6), 0.025, seg=6)
            p.sphere('hull_white', (0, 0, 0.78), 0.55, seg=20, rings=10)
            p.cylz('band_blue', 0, 0, 0.7, 0.16, 0.556, seg=20)
            p.cylz('steel', 0, 0, 1.31, 0.07, 0.1, seg=10)
            p.cylz('band_blue', 0, 0, 1.38, 0.02, 0.13, seg=10)
    p.pipe('steel', [(0.55, 1.6, Z + 1.36), (1.75, 1.6, Z + 1.36)], 0.03, seg=6)
    # --- oxygen capsules (middle), teal band
    for ox in (0.4, 1.1, 1.8):
        tank_v(p, ox, 0.35, Z, 0.3, 1.75, band='trim_teal', glow='glow_cyan')
    p.boxz('dark_metal', 1.1, 0.35, Z + 1.2, 1.9, 0.06, 0.05, bevel=0.01)
    # --- hydrogen bullets (south), white with red band
    for hy_, r_, hl in ((-1.15, 0.4, 0.62), (-2.0, 0.27, 0.6)):
        zc = Z + 0.18 + r_
        for xx in (-0.4, 0.4):
            p.boxz('dark_metal', 1.2 + xx, hy_, Z, 0.12, r_ * 1.5, 0.18 + r_ * 0.5, bevel=0.01)
        p.capsule('hull_white', (1.2 - hl, hy_, zc), (1.2 + hl, hy_, zc), r_, seg=16, rings=4)
        p.cyl('signal_red', (1.2 - 0.14, hy_, zc), (1.2 + 0.14, hy_, zc), r_ + 0.006, seg=16)
        p.cylz('steel', 1.2 + 0.45, hy_, zc + r_ - 0.02, 0.09, 0.04, seg=8)
        p.cylz('signal_red', 1.2 + 0.45, hy_, zc + r_ + 0.07, 0.015, 0.07, seg=10)
    # --- pipework + pump skid
    zp = Z + 0.24
    p.pipe('steel', [(0.2, 0.98, zp), (2.22, 0.98, zp), (2.22, -0.45, zp)], 0.05)
    for sx_ in (0.55, 1.75):
        p.pipe('steel', [(sx_, 1.3, zp + 0.1), (sx_, 0.98, zp)], 0.04, seg=6)
    for ox in (0.4, 1.1, 1.8):
        p.pipe('copper', [(ox, 0.62, zp), (ox, 0.98, zp)], 0.035, seg=6)
        p.cylz('signal_red', ox, 0.8, zp + 0.05, 0.02, 0.055, seg=10)
    p.pipe('copper', [(-0.1, -0.45, zp), (2.22, -0.45, zp)], 0.05)
    p.pipe('copper', [(1.2, -0.45, zp), (1.2, -0.8, zp + 0.2)], 0.04, seg=6)
    p.pipe('copper', [(0.45, -0.45, zp), (0.45, -1.72, zp), (0.6, -1.9, zp)], 0.035, seg=6)
    with p.at(-0.2, -0.7, Z):                              # pump skid
        p.boxz('dark_metal', 0, 0, 0, 0.55, 0.7, 0.1, bevel=0.01)
        p.boxz('hull_offwhite', 0, 0.05, 0.1, 0.42, 0.5, 0.4, bevel=0.03)
        p.boxz('trim_teal', 0, 0.05, 0.38, 0.43, 0.51, 0.06, bevel=0.004)
        p.cyl('dark_metal', (0, -0.33, 0.25), (0, -0.2, 0.25), 0.13, seg=12)
        p.boxz('glow_green', 0.215, 0.05, 0.25, 0.01, 0.08, 0.05, bevel=0)
        p.boxz('glow_cyan', 0.215, 0.18, 0.25, 0.01, 0.08, 0.05, bevel=0)
    for pt in ((2.25, -2.25), (-0.2, -2.25), (2.25, 2.25), (-2.25, 2.25), (-2.25, -2.25)):
        p.cylz('safety_yellow', pt[0], pt[1], Z, 0.3, 0.045, seg=10, b=0.012)
    return m


MODELS = {'storage_depot': storage_depot, 'battery_bank': battery_bank,
          'moxie_unit': moxie_unit, 'storage_silo': storage_silo}
