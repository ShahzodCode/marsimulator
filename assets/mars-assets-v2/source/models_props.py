"""Tier C props (models/props/*.glb).  Origin at base centre.  Tiling pieces: 1 cell, centred on the origin.
Directional pieces: straight runs east-west (X axis); corner joins WEST (-X) and SOUTH (glTF +Z);
tee joins WEST, EAST and SOUTH."""
import math
from marslib import Model, T, R, crate as _crate, barrel as _barrel, rock


def _prop(id_, notes='', **kw):
    return Model(id_, 'prop', notes=notes, subdir='props', **kw)


def _rock(id_, lumps):
    def build():
        m = _prop(id_, notes='Low-poly Mars rock; slightly sunk below y = 0 so it beds into terrain.')
        for (mat, x, y, r, seed, kw) in lumps:
            sz = kw.get('sz', 0.7)
            rock(m.root, mat, x, y, r * sz * 0.72, r, seed, **kw)
        return m
    return build


def crate():
    m = _prop('crate', notes='0.4 cell cargo crate.')
    _crate(m.root, 0, 0, 0, 0.4)
    return m


def barrel():
    m = _prop('barrel', notes='Sealed drum, 0.42 tall.')
    _barrel(m.root, 0, 0, 0)
    return m


PIPE_Z, PIPE_R = 0.3, 0.07


def _flange(p, pos, axis):
    d = {'x': (1, 0, 0), 'y': (0, 1, 0)}[axis]
    for sgn, (x, y) in pos:
        a = (x, y, PIPE_Z)
        b = (x - sgn * 0.035 * d[0], y - sgn * 0.035 * d[1], PIPE_Z)
        p.cyl('steel', a, b, 0.1, seg=12)


def _stand(p, x, y):
    p.boxz('steel', x, y, 0, 0.16, 0.16, 0.02, bevel=0)
    p.boxz('steel', x, y, 0.02, 0.05, 0.05, PIPE_Z - 0.06, bevel=0)
    p.boxz('dark_metal', x, y, PIPE_Z - 0.085, 0.12, 0.12, 0.03, bevel=0.005)


def pipe_straight():
    m = _prop('pipe_straight', footprint=(1, 1), notes='Runs west-east (X). Centre line at y = 0.3, ends at x = +-0.5.')
    p = m.root
    p.cyl('copper', (-0.5, 0, PIPE_Z), (0.5, 0, PIPE_Z), PIPE_R, seg=12)
    _flange(p, [(-1, (-0.5, 0)), (1, (0.5, 0))], 'x')
    p.cyl('steel', (-0.03, 0, PIPE_Z), (0.03, 0, PIPE_Z), PIPE_R + 0.012, seg=12)
    _stand(p, 0, 0)
    return m


def pipe_corner():
    m = _prop('pipe_corner', footprint=(1, 1), notes='Joins the WEST edge (-X) to the SOUTH edge (+Z). Centre line at y = 0.3.')
    p = m.root
    arc = [(-0.45 + 0.45 * math.cos(a), -0.45 + 0.45 * math.sin(a), PIPE_Z)
           for a in (math.radians(90 - 90 * i / 8) for i in range(9))]
    pts = [(-0.5, 0, PIPE_Z)] + arc + [(0, -0.5, PIPE_Z)]      # axis-aligned stubs so the ends sit flush on the cell edge
    p.pipe('copper', pts, PIPE_R, seg=12)
    _flange(p, [(-1, (-0.5, 0))], 'x')
    _flange(p, [(-1, (0, -0.5))], 'y')
    _stand(p, arc[4][0], arc[4][1])
    return m


def pipe_tee():
    m = _prop('pipe_tee', footprint=(1, 1), notes='Joins WEST (-X), EAST (+X) and SOUTH (+Z). Centre line at y = 0.3.')
    p = m.root
    p.cyl('copper', (-0.5, 0, PIPE_Z), (0.5, 0, PIPE_Z), PIPE_R, seg=12)
    p.cyl('copper', (0, 0, PIPE_Z), (0, -0.5, PIPE_Z), PIPE_R, seg=12)
    _flange(p, [(-1, (-0.5, 0)), (1, (0.5, 0))], 'x')
    _flange(p, [(-1, (0, -0.5))], 'y')
    p.cyl('steel', (-0.12, 0, PIPE_Z), (0.12, 0, PIPE_Z), PIPE_R + 0.014, seg=12)
    p.cyl('steel', (0, -0.05, PIPE_Z), (0, -0.13, PIPE_Z), PIPE_R + 0.014, seg=12)
    p.cylz('steel', 0, 0, PIPE_Z + 0.06, 0.07, 0.015, seg=6)
    p.cylz('signal_red', 0, 0, PIPE_Z + 0.13, 0.015, 0.06, seg=10)
    _stand(p, 0, 0)
    return m


BELT_TOP = 0.25


def conveyor_straight():
    m = _prop('conveyor_straight', footprint=(1, 1), notes='Runs west-east (X). Belt top at y = 0.25, ends at x = +-0.5.')
    p = m.root
    p.boxz('rubber_black', 0, 0, BELT_TOP - 0.04, 1.0, 0.5, 0.04, bevel=0)
    for s in (-1, 1):
        p.boxz('steel', 0, s * 0.275, BELT_TOP - 0.09, 1.0, 0.05, 0.12, bevel=0)
        p.boxz('safety_yellow', 0, s * 0.302, BELT_TOP - 0.03, 1.0, 0.006, 0.04, bevel=0)
        for x in (-0.32, 0.32):
            p.boxz('steel', x, s * 0.275, 0, 0.05, 0.05, BELT_TOP - 0.09, bevel=0)
            p.boxz('dark_metal', x, s * 0.275, 0, 0.1, 0.1, 0.02, bevel=0)
    for x in (-0.375, -0.125, 0.125, 0.375):
        p.boxz('dark_metal', x, 0, BELT_TOP - 0.004, 0.025, 0.44, 0.008, bevel=0)
        p.cyl('steel', (x, -0.25, BELT_TOP - 0.07), (x, 0.25, BELT_TOP - 0.07), 0.03, seg=8)
    return m


def conveyor_corner():
    m = _prop('conveyor_corner', footprint=(1, 1), notes='Joins the WEST edge (-X) to the SOUTH edge (+Z). Belt top at y = 0.25.')
    p = m.root
    c = (-0.5, -0.5)
    p.ring('rubber_black', 0.25, 0.75, BELT_TOP - 0.04, 0.04, seg=10, c=c, a0=0, a1=90)
    p.ring('steel', 0.75, 0.8, BELT_TOP - 0.09, 0.12, seg=10, c=c, a0=0, a1=90)
    p.ring('steel', 0.2, 0.25, BELT_TOP - 0.09, 0.12, seg=6, c=c, a0=0, a1=90)
    p.ring('safety_yellow', 0.8, 0.806, BELT_TOP - 0.03, 0.04, seg=10, c=c, a0=0, a1=90)
    for a in (18, 45, 72):
        with p.at(c[0], c[1], 0, rz=a):
            p.boxz('dark_metal', 0.5, 0, BELT_TOP - 0.004, 0.44, 0.025, 0.008, bevel=0)
    for a in (15, 75):
        with p.at(c[0], c[1], 0, rz=a):
            p.boxz('steel', 0.775, 0, 0, 0.05, 0.05, BELT_TOP - 0.09, bevel=0)
            p.boxz('dark_metal', 0.775, 0, 0, 0.1, 0.1, 0.02, bevel=0)
    with p.at(c[0], c[1], 0, rz=45):
        p.boxz('steel', 0.225, 0, 0, 0.05, 0.05, BELT_TOP - 0.09, bevel=0)
        p.boxz('dark_metal', 0.225, 0, 0, 0.1, 0.1, 0.02, bevel=0)
    return m


def solar_panel_single():
    m = _prop('solar_panel_single', notes='Single tilted panel, faces south (+Z).')
    p = m.root
    p.boxz('sintered_regolith', 0, 0, -0.1, 0.3, 0.3, 0.14, bevel=0.02)
    p.cylz('steel', 0, 0, 0.04, 0.34, 0.03, seg=8)
    p.cyl('dark_metal', (-0.08, 0, 0.38), (0.08, 0, 0.38), 0.04, seg=8)
    with p.at(0, 0, 0.4, rx=28):
        p.box('aluminium', (0, 0, 0), (0.92, 0.62, 0.03), bevel=0.008)
        for i in range(3):
            for j in range(2):
                p.box('solar_blue', (-0.3 + i * 0.3, -0.15 + j * 0.3, 0.018), (0.28, 0.28, 0.008), bevel=0)
    return m


def antenna_small():
    m = _prop('antenna_small', notes='Small relay antenna, dish faces south (+Z) and up.')
    p = m.root
    p.boxz('dark_metal', 0, 0, 0, 0.26, 0.26, 0.1, bevel=0.02)
    p.boxz('trim_orange', 0, 0, 0.06, 0.27, 0.27, 0.025, bevel=0.003)
    for k in range(3):
        a = math.radians(90 + k * 120)
        p.cyl('steel', (0.2 * math.cos(a), 0.2 * math.sin(a), 0), (0, 0, 0.3), 0.012, seg=5)
    p.cylz('steel', 0, 0, 0.1, 0.8, 0.018, seg=8)
    p.dish('hull_white', 0.17, 0.05, T(0, -0.03, 0.62) @ R(60, 0, 0), seg=16)
    p.cyl('steel', (0, -0.03, 0.62), (0, -0.14, 0.69), 0.008, seg=5)
    p.sphere('dark_metal', (0, -0.14, 0.69), 0.02, seg=8, rings=4)
    p.box('steel', (0, 0, 0.8), (0.24, 0.01, 0.01), bevel=0)
    p.sphere('glow_red', (0, 0, 0.92), 0.022, seg=8, rings=4)
    return m


def floodlight():
    m = _prop('floodlight', notes='Tripod work light, glow_white head faces south (+Z).')
    p = m.root
    for k in range(3):
        a = math.radians(90 + k * 120)
        p.cyl('steel', (0.24 * math.cos(a), 0.24 * math.sin(a), 0), (0, 0, 0.38), 0.014, seg=5)
        p.cylz('rubber_black', 0.24 * math.cos(a), 0.24 * math.sin(a), 0, 0.02, 0.035, seg=8)
    p.cylz('safety_yellow', 0, 0, 0.3, 0.55, 0.02, seg=8)
    p.boxz('dark_metal', 0, 0, 0.84, 0.3, 0.05, 0.03, bevel=0.005)
    for s in (-1, 1):
        with p.at(s * 0.1, -0.02, 0.94, rx=-25):
            p.box('dark_metal', (0, 0, 0), (0.17, 0.08, 0.13), bevel=0.012)
            p.box('glow_white', (0, -0.042, 0), (0.14, 0.006, 0.1), bevel=0)
    return m


L, D, S = 'loose_regolith', 'regolith_dark', 'sintered_regolith'
MODELS = {
    'rock_small_1': _rock('rock_small_1', [(L, 0, 0, 0.14, 11, dict(sx=1.2))]),
    'rock_small_2': _rock('rock_small_2', [(D, 0, 0, 0.17, 23, dict(sy=0.8, sz=0.6)), (L, 0.14, 0.05, 0.08, 5, {})]),
    'rock_small_3': _rock('rock_small_3', [(S, 0, 0, 0.12, 37, dict(sz=0.9)), (D, -0.12, 0.08, 0.07, 9, {})]),
    'rock_large_1': _rock('rock_large_1', [(D, 0, 0, 0.5, 41, dict(sx=1.25, sz=0.62, seg=10, rings=6)),
                                           (L, 0.48, -0.2, 0.22, 3, dict(sz=0.6)), (S, -0.4, 0.34, 0.16, 8, {})]),
    'rock_large_2': _rock('rock_large_2', [(L, 0, 0, 0.42, 57, dict(sy=1.3, sz=0.85, seg=10, rings=6)),
                                           (D, 0.3, 0.42, 0.26, 14, dict(sz=0.7)), (D, -0.38, -0.3, 0.14, 21, {})]),
    'crate': crate, 'barrel': barrel,
    'pipe_straight': pipe_straight, 'pipe_corner': pipe_corner, 'pipe_tee': pipe_tee,
    'conveyor_straight': conveyor_straight, 'conveyor_corner': conveyor_corner,
    'solar_panel_single': solar_panel_single, 'antenna_small': antenna_small, 'floodlight': floodlight,
}
