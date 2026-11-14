"""Tier B: vehicles, lander, pad, comms tower, scaffold, astronaut.
Vehicles face +X.  Buildings face -Y in Blender (= glTF +Z, south)."""
import math
from marslib import Model, T, R, plinth, crate, barrel, wheel, railing

WHEEL_ROT = (-90, 0, 0)   # local +Z -> world +Y, so a positive spin rolls the vehicle towards +X


# ============================================================================ survey rover
def survey_rover():
    m = Model('survey_rover', 'vehicle', size=(1.6, 1.1), front='+X',
              notes='Six spin_wheel_* nodes (fl/ml/rl = left side, fr/mr/rr = right side); axle is local +Y, '
                    'positive spin rolls the rover forward (+X). Ground contact at y = 0.')
    p = m.root
    p.boxz('dark_metal', 0, 0, 0.32, 0.8, 0.44, 0.05, bevel=0.01)
    p.boxz('hull_white', 0, 0, 0.36, 0.95, 0.56, 0.2, bevel=0.035)
    p.boxz('trim_orange', 0, 0, 0.49, 0.962, 0.572, 0.035, bevel=0.004)
    # solar deck
    p.boxz('aluminium', -0.02, 0, 0.56, 1.02, 0.74, 0.025, bevel=0.008)
    for i, x in enumerate((-0.35, -0.02, 0.31)):
        for y in (-0.18, 0.18):
            if i == 2 and y < 0:
                p.boxz('dark_metal', x, y, 0.585, 0.3, 0.33, 0.012, bevel=0)
                continue
            p.boxz('solar_blue', x, y, 0.585, 0.3, 0.33, 0.012, bevel=0)
            p.boxz('aluminium', x, y, 0.596, 0.3, 0.008, 0.003, bevel=0)
            p.boxz('aluminium', x, y, 0.596, 0.008, 0.33, 0.003, bevel=0)
    # camera mast
    p.cylz('dark_metal', 0.33, -0.2, 0.595, 0.04, 0.05, seg=10)
    p.cylz('steel', 0.33, -0.2, 0.6, 0.4, 0.022, seg=8)
    p.box('hull_white', (0.34, -0.2, 1.04), (0.11, 0.24, 0.1), bevel=0.018)
    p.box('trim_orange', (0.33, -0.2, 1.094), (0.08, 0.2, 0.012), bevel=0)
    p.cyl('dark_metal', (0.39, -0.26, 1.04), (0.415, -0.26, 1.04), 0.04, seg=12)
    p.cyl('window_dark', (0.41, -0.26, 1.04), (0.42, -0.26, 1.04), 0.03, seg=12)
    p.cyl('dark_metal', (0.39, -0.15, 1.05), (0.41, -0.15, 1.05), 0.024, seg=10)
    p.cyl('glow_cyan', (0.405, -0.15, 1.05), (0.413, -0.15, 1.05), 0.014, seg=8)
    # high-gain dish (rear left) + whip antenna
    p.cylz('steel', -0.32, 0.2, 0.6, 0.2, 0.018, seg=8)
    p.dish('hull_white', 0.16, 0.05, T(-0.32, 0.2, 0.8) @ R(0, -28, 0), seg=16)
    p.cyl('steel', (-0.32, 0.2, 0.8), (-0.37, 0.2, 0.9), 0.008, seg=6)
    p.sphere('dark_metal', (-0.37, 0.2, 0.9), 0.018, seg=8, rings=4)
    p.cylz('steel', -0.44, -0.26, 0.6, 0.3, 0.008, seg=6)
    p.sphere('glow_orange', (-0.44, -0.26, 0.91), 0.016, seg=8, rings=4)
    # instrument boxes
    p.boxz('mli_gold', -0.5, 0, 0.38, 0.1, 0.34, 0.15, bevel=0.02)
    p.boxz('dark_metal', 0.5, 0.08, 0.38, 0.08, 0.2, 0.12, bevel=0.015)
    p.cyl('steel', (0.55, 0.12, 0.44), (0.66, 0.12, 0.4), 0.02, seg=8)      # folded sampling arm
    p.cyl('steel', (0.66, 0.12, 0.4), (0.66, -0.1, 0.4), 0.02, seg=8)
    p.boxz('dark_metal', 0.66, -0.12, 0.36, 0.07, 0.07, 0.08, bevel=0.01)
    for y in (-0.2, -0.08):
        p.boxz('glow_white', 0.478, y, 0.42, 0.01, 0.06, 0.04, bevel=0)
    # rocker-bogie suspension
    names = {(0, 1): 'fl', (1, 1): 'ml', (2, 1): 'rl', (0, -1): 'fr', (1, -1): 'mr', (2, -1): 'rr'}
    wx = (0.6, 0.0, -0.6)
    for s in (1, -1):
        A = s * 0.355
        p.cyl('steel', (0.08, s * 0.27, 0.44), (0.08, s * 0.39, 0.44), 0.035, seg=10)
        p.pipe('aluminium', [(0.08, A, 0.44), (0.6, A, 0.42), (0.6, A, 0.17)], 0.024, seg=8)
        p.pipe('aluminium', [(0.08, A, 0.44), (-0.3, A, 0.33)], 0.024, seg=8)
        p.cyl('steel', (-0.3, A - s * 0.03, 0.33), (-0.3, A + s * 0.03, 0.33), 0.035, seg=10)
        p.pipe('aluminium', [(0.0, A, 0.17), (0.0, A, 0.3), (-0.3, A, 0.33), (-0.6, A, 0.38), (-0.6, A, 0.17)], 0.022, seg=8)
        for i, x in enumerate(wx):
            p.cyl('dark_metal', (x, A, 0.17), (x, s * 0.42, 0.17), 0.028, seg=8)
            if i != 1:
                p.boxz('dark_metal', x, A, 0.3, 0.06, 0.05, 0.07, bevel=0.01)
            w = m.spin('spin_wheel_' + names[(i, s)], (x, s * 0.46, 0.17), rot=WHEEL_ROT, speed=3.0)
            wheel(w, 0.17, 0.14)
    return m


# ============================================================================ cargo rover
def cargo_rover():
    m = Model('cargo_rover', 'vehicle', size=(2.4, 1.4), front='+X',
              notes='Six spin_wheel_* nodes (fl/ml/rl, fr/mr/rr); axle is local +Y, positive spin rolls forward (+X). '
                    'Two crates are part of the static mesh.')
    p = m.root
    p.boxz('dark_metal', -0.02, 0, 0.28, 2.25, 0.8, 0.16, bevel=0.03)
    # cab
    cxx = 0.8
    p.boxz('hull_white', cxx, 0, 0.44, 0.7, 1.05, 0.62, bevel=0.08)
    p.boxz('trim_orange', cxx, 0, 0.52, 0.712, 1.062, 0.08, bevel=0.006)
    p.boxz('window_warm', cxx + 0.348, 0, 0.72, 0.012, 0.8, 0.24, bevel=0)
    for s in (-1, 1):
        p.boxz('window_warm', cxx + 0.03, s * 0.523, 0.72, 0.4, 0.012, 0.22, bevel=0)
        p.boxz('dark_metal', cxx - 0.24, s * 0.53, 0.5, 0.02, 0.012, 0.42, bevel=0)     # door seam
    p.boxz('hull_offwhite', cxx - 0.03, 0, 1.06, 0.5, 0.8, 0.03, bevel=0.01)
    p.boxz('dark_metal', cxx + 0.2, 0, 1.06, 0.07, 0.7, 0.05, bevel=0.01)               # light bar
    for y in (-0.27, -0.09, 0.09, 0.27):
        p.boxz('glow_white', cxx + 0.238, y, 1.068, 0.01, 0.1, 0.034, bevel=0)
    p.cylz('steel', cxx - 0.2, -0.3, 1.09, 0.3, 0.008, seg=6)
    p.sphere('glow_orange', (cxx - 0.2, -0.3, 1.4), 0.018, seg=8, rings=4)
    p.dome('hull_white', (cxx - 0.1, 0.2, 1.09), 0.1, 0.05, seg=12, rings=3)
    # nose / bumper / lights
    p.boxz('dark_metal', 1.17, 0, 0.3, 0.08, 1.0, 0.12, bevel=0.02)
    for s in (-1, 1):
        p.boxz('glow_white', 1.156, s * 0.36, 0.46, 0.012, 0.16, 0.06, bevel=0)
        p.boxz('glow_red', -1.146, s * 0.42, 0.36, 0.012, 0.12, 0.05, bevel=0)
    p.boxz('safety_yellow', 1.212, 0, 0.33, 0.006, 0.6, 0.05, bevel=0)
    # flat bed
    bx = -0.37
    p.boxz('panel_grey', bx, 0, 0.44, 1.56, 1.2, 0.07, bevel=0.015)
    p.boxz('dark_metal', 0.39, 0, 0.51, 0.05, 1.1, 0.42, bevel=0.01)                    # headboard
    for s in (-1, 1):
        p.boxz('safety_yellow', bx, s * 0.58, 0.51, 1.5, 0.035, 0.11, bevel=0.008)
    p.boxz('safety_yellow', bx - 0.76, 0, 0.51, 0.035, 1.16, 0.11, bevel=0.008)
    for x in (-0.9, -0.37, 0.16):
        p.boxz('dark_metal', x, 0, 0.511, 0.03, 1.1, 0.006, bevel=0)
    crate(p, -0.03, 0.02, 0.51, 0.56, 'hull_offwhite', 'trim_teal', rz=2)
    crate(p, -0.72, -0.05, 0.51, 0.5, 'hull_white', 'trim_orange', rz=-4, h=0.42)
    p.boxz('rubber_black', -0.03, 0.02, 0.52, 0.06, 0.59, 0.56, bevel=0)                # straps
    p.boxz('rubber_black', -0.72, -0.05, 0.52, 0.06, 0.53, 0.42, bevel=0)
    # side tanks
    for s in (-1, 1):
        p.capsule('mli_gold', (-0.62, s * 0.44, 0.34), (-0.36, s * 0.44, 0.34), 0.085, seg=10, rings=3)
    names = {(0, 1): 'fl', (1, 1): 'ml', (2, 1): 'rl', (0, -1): 'fr', (1, -1): 'mr', (2, -1): 'rr'}
    for i, x in enumerate((0.78, -0.12, -0.85)):
        for s in (1, -1):
            p.cyl('dark_metal', (x, s * 0.36, 0.26), (x, s * 0.5, 0.26), 0.05, seg=8)
            p.boxz('dark_metal', x, s * 0.58, 0.5, 0.5, 0.2, 0.025, bevel=0.008) if i == 0 else None   # mudguard
            w = m.spin('spin_wheel_' + names[(i, s)], (x, s * 0.58, 0.26), rot=WHEEL_ROT, speed=3.0)
            wheel(w, 0.26, 0.2, tyre='rubber_black', hub='aluminium', spoke='steel', cleat='rubber_black',
                  n_cleats=14, n_spokes=5, disc='panel_grey')
    return m


# ============================================================================ supply lander (6 x 6)
def supply_lander():
    m = Model('supply_lander', 'building', (6, 6),
              notes='Four-legged cargo lander on a round pad; open cargo ramp faces south, crates on the ground, '
                    'scorch marks under the engines. No moving parts.')
    p = m.root
    p.cylz('pad_regolith', 0, 0, -0.65, 0.73, 2.9, seg=40, b=0.03)
    p.ring('sintered_regolith', 2.62, 2.9, 0.06, 0.035, seg=40)
    Zp = 0.08
    p.ring('hull_white', 2.2, 2.3, Zp, 0.008, seg=40)
    # scorch marks
    p.cylz('scorch_black', 0, 0, Zp, 0.008, 0.95, seg=20)
    lens = (1.5, 1.9, 1.35, 1.75, 1.45, 2.0, 1.3, 1.8, 1.55, 1.95, 1.4, 1.7)
    for i, L in enumerate(lens):
        with p.at(rz=i * 30 + 11):
            p.extrude('scorch_black', [(0.6, -0.22), (L, 0), (0.6, 0.22)], Zp, 0.006)
    # legs
    for k in range(4):
        with p.at(rz=45 + k * 90):
            p.cylz('steel', 2.0, 0, Zp, 0.05, 0.27, seg=14, b=0.015)
            p.dome('dark_metal', (2.0, 0, Zp + 0.05), 0.11, 0.09, seg=10, rings=3)
            a, b = (0.95, 0, 1.45), (2.0, 0, Zp + 0.12)
            p.cyl('aluminium', a, b, 0.055, seg=8)
            la = [a[i] + (b[i] - a[i]) * 0.12 for i in range(3)]
            lb = [a[i] + (b[i] - a[i]) * 0.55 for i in range(3)]
            p.cyl('mli_gold', la, lb, 0.08, seg=10)
            for s in (-1, 1):
                p.cyl('steel', (0.95, s * 0.42, 1.0), (1.93, 0, Zp + 0.14), 0.028, seg=6)
    # engines
    for k in range(4):
        with p.at(rz=k * 90):
            p.lathe('dark_metal', [(0, 0.5), (0.27, 0.5), (0.12, 0.92), (0, 0.92)], seg=14, L=T(0.55, 0, 0))
            p.cylz('glow_orange', 0.55, 0, 0.495, 0.004, 0.2, seg=14)
    # descent stage + cargo module
    p.lathe('mli_gold', [(0, 0.9), (1.0, 0.9), (1.15, 1.0), (1.15, 1.17), (0, 1.17)], seg=8, L=R(0, 0, 22.5))
    p.cylz('hull_white', 0, 0, 1.17, 0.85, 1.0, seg=24, b=0.03)
    p.cylz('trim_orange', 0, 0, 1.76, 0.12, 1.008, seg=24)
    p.cylz('trim_teal', 0, 0, 1.7, 0.04, 1.008, seg=24)
    p.lathe('hull_offwhite', [(0.97, 2.02), (0.48, 2.45), (0, 2.45)], seg=24)
    p.cylz('dark_metal', 0, 0, 2.45, 0.06, 0.48, seg=20)
    p.cylz('hull_white', 0, 0, 2.51, 0.05, 0.3, seg=16, b=0.015)
    p.cylz('trim_teal', 0, 0, 2.56, 0.012, 0.18, seg=16)
    p.cylz('steel', 0.36, 0.1, 2.51, 0.35, 0.01, seg=6)
    p.sphere('glow_red', (0.36, 0.1, 2.88), 0.025, seg=8, rings=4)
    for k in range(4):
        with p.at(rz=k * 90 + 45):
            p.boxz('dark_metal', 0.86, 0, 2.08, 0.14, 0.14, 0.1, bevel=0.015)       # thruster quads
            p.boxz('glow_cyan', 0.74, 0, 2.3, 0.05, 0.1, 0.02, bevel=0)
    for k in (1, 3):                                                                 # window ports E/W
        with p.at(rz=k * 90 + 90):
            p.box('window_warm', (1.0, 0, 1.5), (0.02, 0.3, 0.16), bevel=0)
    # round solar arrays on booms (east / west)
    for s in (-1, 1):
        p.cyl('aluminium', (s * 0.95, 0, 1.45), (s * 1.75, 0, 1.6), 0.025, seg=6)
        p.cylz('aluminium', s * 1.75, 0, 1.6, 0.02, 0.52, seg=20)
        p.cylz('solar_blue', s * 1.75, 0, 1.62, 0.008, 0.48, seg=20)
        for a in range(5):
            with p.at(s * 1.75, 0, 1.628, rz=a * 36):
                p.boxz('aluminium', 0, 0, 0, 0.96, 0.012, 0.003, bevel=0)
        p.cylz('dark_metal', s * 1.75, 0, 1.628, 0.012, 0.07, seg=10)
    # cargo door + ramp (south)
    p.boxz('trim_orange', 0, -0.97, 1.17, 0.98, 0.16, 0.74, bevel=0.02)
    p.boxz('window_dark', 0, -1.0, 1.19, 0.8, 0.12, 0.62, bevel=0)
    p.boxz('window_warm', 0, -1.062, 1.7, 0.5, 0.006, 0.05, bevel=0)
    dy, dz = 1.6, 1.17 - (Zp + 0.02)
    ang = math.degrees(math.atan2(dz, dy))
    Lr = math.hypot(dy, dz)
    with p.at(0, -1.1 - dy / 2, Zp + 0.02 + dz / 2, rx=ang):
        p.box('panel_grey', (0, 0, 0), (0.8, Lr, 0.045), bevel=0.01)
        for s in (-1, 1):
            p.box('safety_yellow', (s * 0.41, 0, 0.03), (0.04, Lr, 0.1), bevel=0.008)
        for i in range(7):
            p.box('dark_metal', (0, -Lr / 2 + 0.2 + i * 0.25, 0.026), (0.7, 0.03, 0.01), bevel=0)
    # cargo on the ground
    crate(p, -0.9, -2.15, Zp, 0.46, 'hull_offwhite', 'trim_orange', rz=10)
    crate(p, 0.85, -2.3, Zp, 0.42, 'hull_white', 'trim_teal', rz=-8)
    crate(p, 0.8, -1.82, Zp, 0.36, 'panel_grey', 'safety_yellow', rz=20)
    crate(p, 0.0, -1.62, 0.72, 0.34, 'hull_offwhite', 'trim_teal', rz=0)   # one coming down the ramp
    barrel(p, -1.35, -1.9, Zp, mat='trim_teal')
    return m


# ============================================================================ landing pad (6 x 6)
def landing_pad():
    m = Model('landing_pad', 'building', (6, 6),
              notes='Flat circular pad, 12 glow_orange edge lights, painted rings + chevrons (geometry). Max height 0.25.')
    p = m.root
    p.cylz('sintered_regolith', 0, 0, -0.65, 0.75, 2.92, seg=48, b=0.03)
    p.cylz('pad_regolith', 0, 0, 0.1, 0.015, 2.5, seg=48)
    Zm = 0.115
    p.ring('hull_white', 2.05, 2.17, Zm, 0.008, seg=48)
    p.ring('safety_yellow', 0.8, 0.9, Zm, 0.008, seg=32)
    p.cylz('trim_orange', 0, 0, Zm, 0.008, 0.28, seg=24)
    chev = [(0, -0.36), (0.16, -0.36), (0.5, 0), (0.16, 0.36), (0, 0.36), (0.34, 0)]
    for k in range(4):
        with p.at(rz=k * 90):
            p.extrude('trim_orange', [(x + 1.2, y) for x, y in chev], Zm, 0.008)
        with p.at(rz=k * 90 + 45):
            p.boxz('hull_white', 1.45, 0, Zm, 0.6, 0.1, 0.008, bevel=0)
    for k in range(24):                       # sintered tile seams on the rim
        with p.at(rz=k * 15 + 7.5):
            p.boxz('pad_regolith', 2.71, 0, 0.1, 0.38, 0.03, 0.006, bevel=0)
    for k in range(12):
        with p.at(rz=k * 30):
            p.cylz('dark_metal', 2.72, 0, 0.1, 0.08, 0.075, seg=10, b=0.012)
            p.dome('glow_orange', (2.72, 0, 0.18), 0.05, 0.065, seg=10, rings=3)
    return m


# ============================================================================ comms tower (3 x 3)
def comms_tower():
    m = Model('comms_tower', 'building', (3, 3),
              notes='Lattice mast (north-east of centre) with a slowly turning dish (spin_dish, vertical axis) carrying '
                    'the red beacon (material glow_red - blink it in-game); equipment hut in the south-west, door facing south.')
    p = m.root
    Z = plinth(p, 2.9, 2.9)
    mx, my = 0.3, 0.35
    levels = [Z, 0.76, 1.4, 2.04, 2.68]

    def hw(z):
        return 0.42 - 0.27 * (z - Z) / (2.68 - Z)

    def corner(k, z):
        sx, sy = ((-1, -1), (1, -1), (1, 1), (-1, 1))[k % 4]
        return (mx + sx * hw(z), my + sy * hw(z), z)

    for k in range(4):
        p.boxz('sintered_regolith', corner(k, Z)[0], corner(k, Z)[1], Z, 0.2, 0.2, 0.08, bevel=0.015)
        p.cyl('steel', corner(k, Z), corner(k, 2.68), 0.032, seg=6)
        for i, z in enumerate(levels[1:]):
            p.cyl('steel', corner(k, z), corner(k + 1, z), 0.016, seg=5, caps=False)
            z0 = levels[i]
            a, b = (corner(k, z0), corner(k + 1, z)) if i % 2 == 0 else (corner(k + 1, z0), corner(k, z))
            p.cyl('steel', a, b, 0.014, seg=5, caps=False)
    p.boxz('dark_metal', mx, my, 2.68, 0.5, 0.5, 0.05, bevel=0.01)
    p.boxz('trim_orange', mx, my, 2.0, 0.42, 0.42, 0.05, bevel=0.005)
    p.cylz('steel', mx, my, 2.73, 0.14, 0.1, seg=12)
    # fixed relay dish + panel antennas on the mast
    p.dish('hull_offwhite', 0.24, 0.07, T(mx + 0.3, my, 1.75) @ R(0, 75, 0), seg=14)
    p.cyl('steel', (mx + 0.1, my, 1.75), (mx + 0.3, my, 1.75), 0.02, seg=6)
    for k in range(3):
        with p.at(mx, my, 2.3, rz=k * 120 + 90):
            p.boxz('hull_white', 0.24, 0, 0, 0.04, 0.1, 0.32, bevel=0.01)
    # cable from the hut up the mast
    p.pipe('rubber_black', [(-0.3, -0.5, Z + 0.3), (-0.02, -0.07, Z + 0.05), (0.07, 0.12, 0.9), (0.14, 0.19, 2.0)], 0.02, seg=6)
    # guy wires
    for gx, gy in ((1.32, 1.32), (-1.3, 1.3), (1.3, -1.25)):
        p.cyl('steel', (mx, my, 2.6), (gx, gy, Z + 0.06), 0.007, seg=4, caps=False)
        p.boxz('sintered_regolith', gx, gy, Z, 0.16, 0.16, 0.08, bevel=0.015)
    # rotating dish + beacon
    a = m.spin('spin_dish', (mx, my, 2.87), speed=0.2)
    a.cylz('dark_metal', 0, 0, 0, 0.1, 0.13, seg=14, b=0.015)
    a.boxz('steel', 0, 0.04, 0.1, 0.12, 0.14, 0.3, bevel=0.015)
    with a.at(0, 0, 0.42, rx=50):
        a.dish('hull_white', 0.68, 0.2, T(), seg=24)
        a.lathe('trim_orange', [(0.655, 0.185), (0.695, 0.185), (0.695, 0.215), (0.655, 0.215)], 24, close=True)
        for k in range(3):
            ang = math.radians(90 + k * 120)
            a.cyl('steel', (0.6 * math.cos(ang), 0.6 * math.sin(ang), 0.156), (0, 0, 0.52), 0.012, seg=5)
        a.cylz('dark_metal', 0, 0, 0.47, 0.1, 0.05, seg=10)
        a.boxz('dark_metal', 0, 0, -0.13, 0.22, 0.22, 0.12, bevel=0.02)
    a.pipe('steel', [(0, 0.1, 0.3), (0, 0.44, 0.3), (0, 0.44, 1.3)], 0.018, seg=6)
    a.cylz('dark_metal', 0, 0.44, 1.3, 0.03, 0.04, seg=8)
    a.sphere('glow_red', (0, 0.44, 1.37), 0.055, seg=10, rings=6)
    # equipment hut
    with p.at(-0.65, -0.75, Z):
        p.boxz('hull_white', 0, 0, 0, 1.2, 1.0, 0.8, bevel=0.04)
        p.boxz('trim_orange', 0, 0, 0.6, 1.215, 1.015, 0.09, bevel=0.006)
        p.boxz('panel_grey', 0, 0, 0.8, 1.08, 0.88, 0.04, bevel=0.01)
        p.boxz('dark_metal', -0.25, -0.505, 0.02, 0.32, 0.03, 0.56, bevel=0.01)
        p.boxz('glow_green', -0.25, -0.522, 0.62, 0.08, 0.01, 0.04, bevel=0)
        p.boxz('window_warm', 0.25, -0.505, 0.36, 0.34, 0.012, 0.18, bevel=0)
        p.boxz('dark_metal', 0.2, 0.1, 0.84, 0.5, 0.45, 0.1, bevel=0.015)           # roof cooler
        for i in range(4):
            p.boxz('aluminium', 0.2, -0.06 + i * 0.11, 0.94, 0.44, 0.04, 0.05, bevel=0.005)
        p.cylz('steel', -0.4, 0.25, 0.84, 0.4, 0.012, seg=6)
        p.box('steel', (-0.4, 0.25, 1.15), (0.3, 0.012, 0.012), bevel=0)
        p.box('steel', (-0.4, 0.25, 1.05), (0.22, 0.012, 0.012), bevel=0)
    # small solar panel (south-east)
    p.cylz('steel', 0.85, -0.95, Z, 0.3, 0.02, seg=6)
    p.box('aluminium', (0.85, -0.95, Z + 0.34), (0.8, 0.5, 0.025), rot=(25, 0, 0), bevel=0.006)
    p.box('solar_blue', (0.85, -0.955, Z + 0.352), (0.74, 0.44, 0.012), rot=(25, 0, 0), bevel=0)
    return m


# ============================================================================ construction scaffold (1 x 1, stretchable)
def construction_scaffold():
    m = Model('construction_scaffold', 'prop', footprint=(1, 1),
              notes='Box-like 1x1x1.2 scaffold cell meant to be scaled in X/Z to any footprint; posts reach y = -0.65.')
    p = m.root
    e = 0.46
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.boxz('steel', sx * e, sy * e, -0.65, 0.05, 0.05, 1.85, bevel=0)
            p.boxz('dark_metal', sx * e, sy * e, 0, 0.11, 0.11, 0.02, bevel=0)
    for z, mat, t in ((0.4, 'steel', 0.03), (0.8, 'steel', 0.03), (1.17, 'safety_yellow', 0.05)):
        for s in (-1, 1):
            p.boxz(mat, 0, s * e, z, 2 * e, t, t, bevel=0)
            p.boxz(mat, s * e, 0, z, t, 2 * e, t, bevel=0)
    for s in (-1, 1):                                       # diagonal braces on east/west + south
        p.cyl('steel', (s * e, -e, 0.02), (s * e, e, 0.8), 0.014, seg=5, caps=False)
        p.cyl('steel', (s * e, e, 0.82), (s * e, -e, 1.17), 0.014, seg=5, caps=False)
    p.cyl('steel', (-e, -e, 0.02), (e, -e, 0.8), 0.014, seg=5, caps=False)
    p.boxz('panel_grey', 0, 0.2, 0.83, 0.9, 0.46, 0.025, bevel=0)                  # deck planks (north half)
    p.boxz('safety_yellow', 0, -0.03, 0.855, 0.9, 0.02, 0.07, bevel=0)             # toe board
    # tarp over the north-west corner
    p.boxz('trim_teal', -0.2, 0.22, 1.222, 0.56, 0.52, 0.012, bevel=0)
    p.box('trim_teal', (-0.2, 0.492, 0.93), (0.56, 0.012, 0.6), bevel=0)
    p.box('trim_teal', (-0.492, 0.22, 1.02), (0.012, 0.52, 0.42), bevel=0)
    p.boxz('glow_orange', e, -e, 1.22, 0.05, 0.05, 0.05, bevel=0.008)              # warning lamp
    return m


# ============================================================================ astronaut
def astronaut():
    m = Model('astronaut', 'character', size=(0.14, 0.11),
              notes='Standing pose, 0.35 tall, gold visor faces south (+Z). No face, no skeleton.')
    p = m.root
    with p.at(s=0.35 / 1.9):
        for s in (-1, 1):
            p.boxz('panel_grey', s * 0.13, -0.04, 0, 0.18, 0.32, 0.13, bevel=0.035)
            p.capsule('hull_white', (s * 0.13, 0, 0.2), (s * 0.13, 0, 0.78), 0.105, seg=10, rings=3)
            p.cylz('trim_orange', s * 0.13, 0, 0.42, 0.07, 0.112, seg=10)
            p.capsule('hull_white', (s * 0.34, 0, 1.3), (s * 0.43, -0.03, 0.9), 0.085, seg=10, rings=3)
            p.cyl('trim_orange', (s * 0.37, -0.01, 1.16), (s * 0.385, -0.015, 1.1), 0.092, seg=10)
            p.sphere('trim_orange', (s * 0.44, -0.035, 0.84), 0.1, seg=10, rings=5)
        p.boxz('hull_white', 0, 0, 0.8, 0.54, 0.36, 0.64, bevel=0.1)
        p.boxz('panel_grey', 0, 0, 0.8, 0.555, 0.375, 0.07, bevel=0.01)
        p.boxz('hull_offwhite', 0, -0.2, 1.06, 0.28, 0.08, 0.22, bevel=0.025)
        p.boxz('glow_cyan', -0.06, -0.243, 1.18, 0.06, 0.01, 0.05, bevel=0)
        p.boxz('trim_orange', 0.06, -0.243, 1.18, 0.07, 0.01, 0.05, bevel=0)
        p.boxz('hull_offwhite', 0, 0.26, 0.86, 0.48, 0.22, 0.74, bevel=0.06)
        p.boxz('trim_orange', 0, 0.26, 1.48, 0.34, 0.225, 0.06, bevel=0.01)
        p.cylz('steel', 0.17, 0.3, 1.6, 0.3, 0.012, seg=6)
        p.cylz('steel', 0, 0, 1.42, 0.06, 0.18, seg=12)
        p.sphere('hull_white', (0, 0, 1.67), 0.23, seg=14, rings=8)
        # visor: a clean spherical cap just proud of the helmet, facing south and slightly down
        rv = 0.24
        cap = [(rv * math.sin(math.radians(t)), rv * math.cos(math.radians(t))) for t in (58, 44, 30, 15)] + [(0, rv)]
        p.lathe('mli_gold', cap, seg=14, L=T(0, 0, 1.67) @ R(98, 0, 0))
        p.lathe('panel_grey', [(rv * math.sin(math.radians(62)), rv * math.cos(math.radians(62)) - 0.004),
                               (rv * math.sin(math.radians(58)) + 0.012, rv * math.cos(math.radians(58)) + 0.004)],
                seg=14, L=T(0, 0, 1.67) @ R(98, 0, 0))
    return m


MODELS = {'survey_rover': survey_rover, 'cargo_rover': cargo_rover, 'supply_lander': supply_lander,
          'landing_pad': landing_pad, 'comms_tower': comms_tower,
          'construction_scaffold': construction_scaffold, 'astronaut': astronaut}
