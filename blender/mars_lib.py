"""
Modelling helpers for the Mars Colony building models.

Run inside Blender (via the Blender MCP or the Text Editor):
    exec(open(r'<project>/blender/mars_lib.py').read(), globals())

Conventions (match the game's settlement grid):
  * 1 Blender unit = 1 settlement grid cell.
  * +X = east, +Y = north, +Z = up. The glTF exporter turns this into three.js
    +X east, +Y up, +Z south.
  * Every model is centred on its footprint; z = 0 is the ground. Foundations go
    ~0.65 below ground so the model never floats on uneven terrain.
  * Objects whose name starts with "spin_" are exported as separate nodes with a
    "spin" custom property (rad/s) — the game rotates them around their local up axis.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

TAU = math.tau
PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if '__file__' in globals() else r'C:\Projects\Build a Junior Astronaut mission trainer'
OUT_DIR = os.path.join(PROJECT, 'public', 'models')

_state = {'col': None, 'name': None, 'spin': []}


# ---------------------------------------------------------------------------
# Scene / collections
# ---------------------------------------------------------------------------

def scene():
    scn = bpy.data.scenes.get('MarsBuildings')
    if scn is None:
        scn = bpy.data.scenes.new('MarsBuildings')
        scn.unit_settings.system = 'METRIC'
    if bpy.context.window and bpy.context.window.scene != scn:
        bpy.context.window.scene = scn
    return scn


def _clear_collection(col):
    for o in list(col.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and getattr(data, 'users', 1) == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)


def begin(name):
    """Start (or restart) a building: parts go to collection SRC_<name>."""
    scn = scene()
    for prefix in ('SRC_', 'GLB_'):
        col = bpy.data.collections.get(prefix + name)
        if col is None:
            col = bpy.data.collections.new(prefix + name)
            scn.collection.children.link(col)
        elif col.name not in scn.collection.children:
            scn.collection.children.link(col)
        _clear_collection(col)
    _state['col'] = bpy.data.collections['SRC_' + name]
    _state['col'].hide_viewport = False
    _state['col'].hide_render = False
    _state['name'] = name
    _state['spin'] = []
    return _state['col']


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def mat(name, color, metal=0.0, rough=0.5, emit=None, strength=1.0, alpha=1.0, image=None):
    """Principled material (cached by name, settings refreshed on every call)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        nt.nodes.clear()
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        outn = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs[0], outn.inputs[0])
    c = _rgb(color)
    bsdf.inputs['Base Color'].default_value = (*c, 1.0)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*_rgb(emit), 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    else:
        bsdf.inputs['Emission Strength'].default_value = 0.0
    bsdf.inputs['Alpha'].default_value = alpha
    if alpha < 1.0:
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'BLENDED'
        if hasattr(m, 'blend_method'):
            m.blend_method = 'BLEND'
    if image is not None:
        tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    m.diffuse_color = (*c, alpha)
    return m


def _rgb(hexstr):
    h = hexstr.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in srgb)


def image(name, w, h, painter):
    """Creates a packed RGBA image; painter(px, w, h) fills a flat float list (rgba)."""
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = [0.0] * (w * h * 4)
    painter(px, w, h)
    img.pixels = px
    img.pack()
    return img


def library():
    """The shared material palette (same names in every model → shared in the GLBs)."""
    return {
        'white': mat('hull_white', '#e9e6df', 0.05, 0.42),
        'offwhite': mat('hull_offwhite', '#d6d1c7', 0.05, 0.55),
        'panel': mat('panel_grey', '#b9b5ad', 0.1, 0.6),
        'orange': mat('trim_orange', '#e2622a', 0.0, 0.45),
        'teal': mat('trim_teal', '#2aa596', 0.0, 0.45),
        'yellow': mat('safety_yellow', '#efb128', 0.0, 0.5),
        'red': mat('signal_red', '#c8322a', 0.0, 0.5),
        'metal': mat('steel', '#a9b0b8', 0.85, 0.32),
        'alu': mat('aluminium', '#c9ced3', 0.9, 0.25),
        'dark': mat('dark_metal', '#373c44', 0.6, 0.45),
        'black': mat('rubber_black', '#1d1f23', 0.0, 0.85),
        'gold': mat('mli_gold', '#d7a640', 1.0, 0.28),
        'copper': mat('copper', '#b8703e', 1.0, 0.35),
        'concrete': mat('sintered_regolith', '#8f8072', 0.0, 0.95),
        'pad': mat('pad_regolith', '#a39282', 0.0, 1.0),
        'regolith': mat('loose_regolith', '#a4532b', 0.0, 1.0),
        'regolith_dark': mat('regolith_dark', '#7a3c1f', 0.0, 1.0),
        'sandbag': mat('regolith_bag', '#9c6a48', 0.0, 0.95),
        'glass': mat('glass', '#bfe3ff', 0.0, 0.05, alpha=0.22),
        'window': mat('window_dark', '#1c2b3a', 0.3, 0.08),
        'glow_white': mat('glow_white', '#000000', 0, 1, emit='#fff1d6', strength=6.0),
        'glow_cyan': mat('glow_cyan', '#000000', 0, 1, emit='#5ff3ff', strength=5.0),
        'glow_orange': mat('glow_orange', '#000000', 0, 1, emit='#ff8a2a', strength=7.0),
        'glow_red': mat('glow_red', '#000000', 0, 1, emit='#ff3b3b', strength=7.0),
        'glow_green': mat('glow_green', '#000000', 0, 1, emit='#6dff8a', strength=5.0),
        'glow_pink': mat('glow_pink', '#000000', 0, 1, emit='#ff5fd2', strength=5.0),
        'warm_window': mat('window_warm', '#2a2015', 0.0, 0.2, emit='#ffcf8a', strength=1.6),
    }


# ---------------------------------------------------------------------------
# Primitive helpers (all create objects in the current SRC collection)
# ---------------------------------------------------------------------------

def _obj(name, bm, material, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    _state['col'].objects.link(o)
    if isinstance(material, (list, tuple)):
        for mm in material:
            me.materials.append(mm)
    else:
        me.materials.append(material)
    o.location = loc
    o.rotation_euler = Euler(rot, 'XYZ')
    o.scale = scale
    return o


def _bm():
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    return bm


def bevel(o, width=0.02, segments=2, angle=40):
    if width <= 0:
        return o
    md = o.modifiers.new('bevel', 'BEVEL')
    md.width = width
    md.segments = segments
    md.limit_method = 'ANGLE'
    md.angle_limit = math.radians(angle)
    md.harden_normals = False
    return o


def box(m, sx, sy, sz, x=0, y=0, z=0, rz=0, rx=0, ry=0, bev=0.015, name='box'):
    """Box whose BOTTOM face sits at z (like the game's ModelBuilder.box)."""
    bm = _bm()
    bmesh.ops.create_cube(bm, size=1, calc_uvs=True)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    o = _obj(name, bm, m, (x, y, z), (rx, ry, rz), (sx, sy, sz))
    _apply_scale(o)
    return bevel(o, bev, 2) if bev else o


def cbox(m, sx, sy, sz, x=0, y=0, z=0, rz=0, rx=0, ry=0, bev=0.0, name='cbox'):
    """Box centred on (x, y, z)."""
    bm = _bm()
    bmesh.ops.create_cube(bm, size=1, calc_uvs=True)
    o = _obj(name, bm, m, (x, y, z), (rx, ry, rz), (sx, sy, sz))
    _apply_scale(o)
    return bevel(o, bev, 2) if bev else o


def _apply_scale(o):
    me = o.data
    me.transform(Matrix.Diagonal((*o.scale, 1.0)))
    o.scale = (1, 1, 1)


def cyl(m, r, h, x=0, y=0, z=0, seg=24, r2=None, caps=True, rot=(0, 0, 0), bev=0.0, name='cyl'):
    """Cylinder/cone with its BOTTOM at z (local), axis along local Z; r = bottom radius."""
    bm = _bm()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=h, calc_uvs=True)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
    o = _obj(name, bm, m, (x, y, z), rot)
    return bevel(o, bev, 2, 30) if bev else o


def tube(m, r, length, x, y, z, heading=0.0, pitch=0.0, seg=16, r2=None, bev=0.0, name='tube'):
    """Cylinder centred at (x, y, z) lying along +X rotated by heading (around Z) and pitch."""
    bm = _bm()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=length, calc_uvs=True)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    o = _obj(name, bm, m, (x, y, z), (0, -pitch, heading))
    return bevel(o, bev, 2, 30) if bev else o


def strut(m, a, b, r=0.03, seg=8, name='strut'):
    """Cylinder from point a to point b."""
    a = Vector(a)
    b = Vector(b)
    d = b - a
    bm = _bm()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=d.length, calc_uvs=True)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, d.length / 2))
    o = _obj(name, bm, m, a)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return o


def sphere(m, r, x=0, y=0, z=0, seg=24, rings=14, scale=(1, 1, 1), name='sphere'):
    bm = _bm()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, calc_uvs=True)
    o = _obj(name, bm, m, (x, y, z), (0, 0, 0), scale)
    _apply_scale(o)
    return o


def dome(m, r, x=0, y=0, z=0, seg=32, rings=12, sz=1.0, name='dome'):
    """Upper hemisphere with its rim at z."""
    bm = _bm()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings * 2, radius=r, calc_uvs=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-5], context='VERTS')
    for v in bm.verts:
        v.co.z *= sz
    o = _obj(name, bm, m, (x, y, z))
    return o


def torus(m, R, r, x=0, y=0, z=0, rot=(0, 0, 0), seg=48, rseg=10, arc=TAU, name='torus'):
    bm = _bm()
    rings = []
    closed = arc >= TAU - 1e-6
    n = seg if closed else seg + 1
    for i in range(n):
        a = arc * i / seg
        ring = []
        for j in range(rseg):
            b = TAU * j / rseg
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        r0 = rings[i]
        r1 = rings[(i + 1) % n]
        for j in range(rseg):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % rseg], r0[(j + 1) % rseg]))
    return _obj(name, bm, m, (x, y, z), rot)


def ring(m, r_in, r_out, h, x=0, y=0, z=0, seg=48, rot=(0, 0, 0), name='ring'):
    """Flat annulus with thickness h (bottom at z)."""
    bm = _bm()
    top_o, top_i, bot_o, bot_i = [], [], [], []
    for i in range(seg):
        a = TAU * i / seg
        c, s = math.cos(a), math.sin(a)
        bot_o.append(bm.verts.new((c * r_out, s * r_out, 0)))
        bot_i.append(bm.verts.new((c * r_in, s * r_in, 0)))
        top_o.append(bm.verts.new((c * r_out, s * r_out, h)))
        top_i.append(bm.verts.new((c * r_in, s * r_in, h)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((top_o[i], top_i[i], top_i[j], top_o[j]))
        bm.faces.new((bot_o[j], bot_i[j], bot_i[i], bot_o[i]))
        bm.faces.new((bot_o[i], top_o[i], top_o[j], bot_o[j]))
        bm.faces.new((bot_i[j], top_i[j], top_i[i], bot_i[i]))
    return _obj(name, bm, m, (x, y, z), rot)


def pipe(m, points, r=0.04, seg=10, name='pipe', caps=True):
    """Pipe through a list of points (rounded elbows via a smoothed poly path)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(1, seg // 4)
    cu.use_fill_caps = caps
    sp = cu.splines.new('POLY')
    pts = _rounded(points, min(0.18, r * 3.5))
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1)
    o = bpy.data.objects.new(name, cu)
    _state['col'].objects.link(o)
    cu.materials.append(m)
    return o


def _rounded(points, radius, steps=4):
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        d1 = (a - b)
        d2 = (c - b)
        rr = min(radius, d1.length * 0.45, d2.length * 0.45)
        p1 = b + d1.normalized() * rr
        p2 = b + d2.normalized() * rr
        for k in range(steps + 1):
            t = k / steps
            out.append((1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t ** 2 * p2)
    out.append(pts[-1])
    return out


def flange(m, r, x, y, z, rot=(0, 0, 0), bolts=8, bolt_m=None, thick=0.04):
    """Pipe flange disc with a ring of bolt heads."""
    o = cyl(m, r, thick, x, y, z, 20, rot=rot, name='flange')
    if bolt_m is not None:
        R = Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')
        for i in range(bolts):
            a = TAU * i / bolts
            local = Vector((math.cos(a) * r * 0.78, math.sin(a) * r * 0.78, thick))
            p = Vector((x, y, z)) + (R @ local.to_4d()).to_3d()
            cyl(bolt_m, r * 0.1, thick * 0.6, p.x, p.y, p.z, 6, rot=rot, name='bolt')
    return o


def ladder(m, x, y, z, h, rz=0.0, w=0.32, rung=0.22):
    """Vertical ladder with side rails, facing along local -Y."""
    Rz = Matrix.Rotation(rz, 3, 'Z')
    base = Vector((x, y, z))
    for sx in (-w / 2, w / 2):
        a = base + Rz @ Vector((sx, 0, 0))
        strut(m, a, a + Vector((0, 0, h)), 0.018, 6, 'ladder_rail')
    k = int(h / rung)
    for i in range(1, k + 1):
        p = base + Vector((0, 0, i * rung))
        strut(m, p + Rz @ Vector((-w / 2, 0, 0)), p + Rz @ Vector((w / 2, 0, 0)), 0.012, 5, 'ladder_rung')


def railing(m, pts, h=0.45, post_every=0.5, r=0.014):
    """Handrail along a polyline (posts + top and mid rails)."""
    pts = [Vector(p) for p in pts]
    for a, b in zip(pts[:-1], pts[1:]):
        d = b - a
        n = max(1, int(d.length / post_every))
        for i in range(n + 1):
            p = a + d * (i / n)
            strut(m, p, p + Vector((0, 0, h)), r, 6, 'rail_post')
        strut(m, a + Vector((0, 0, h)), b + Vector((0, 0, h)), r, 6, 'rail_top')
        strut(m, a + Vector((0, 0, h * 0.5)), b + Vector((0, 0, h * 0.5)), r * 0.8, 6, 'rail_mid')


def corrugated(m, w, h, x, y, z, rz=0.0, pitch=0.1, depth=0.025, name='corrugated'):
    """Corrugated sheet-metal wall of width w (along local X), height h, facing local -Y."""
    bm = _bm()
    nx = max(2, int(w / pitch * 4))
    cols = []
    for i in range(nx + 1):
        u = -w / 2 + w * i / nx
        off = -depth * 0.5 * (1 + math.cos(TAU * (u + w / 2) / pitch))
        cols.append((bm.verts.new((u, off, 0)), bm.verts.new((u, off, h))))
    for i in range(nx):
        a0, a1 = cols[i]
        b0, b1 = cols[i + 1]
        bm.faces.new((a0, b0, b1, a1))
    return _obj(name, bm, m, (x, y, z), (0, 0, rz))


def grille(m, w, h, x, y, z, rz=0.0, slats=8, depth=0.03, name='grille'):
    """Louvred vent: slats tilted 35°, facing local -Y."""
    for i in range(slats):
        zz = z + h * (i + 0.5) / slats
        cbox(m, w, depth, h / slats * 0.8, x, y, zz, rz=rz, rx=math.radians(35), name='slat')


def fan(m, hub_m, r, x, y, z, blades=5, spin=6.0, name='spin_fan'):
    """Horizontal fan rotor (separate spinning node)."""
    bm = _bm()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=r * 0.22, radius2=r * 0.18, depth=0.05, calc_uvs=True)
    for i in range(blades):
        a = TAU * i / blades
        geom = bmesh.ops.create_cube(bm, size=1)['verts']
        bmesh.ops.scale(bm, vec=(r * 0.8, r * 0.26, 0.012), verts=geom)
        bmesh.ops.rotate(bm, verts=geom, cent=(0, 0, 0), matrix=Matrix.Rotation(0.35, 3, 'X'))
        bmesh.ops.translate(bm, verts=geom, vec=(r * 0.55, 0, 0))
        bmesh.ops.rotate(bm, verts=geom, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z'))
    o = _obj(name, bm, m, (x, y, z))
    return mark_spin(o, spin)


def mark_spin(o, speed):
    if not o.name.startswith('spin_'):
        o.name = 'spin_' + o.name
    o['spin'] = float(speed)
    _state['spin'].append(o)
    return o


def lathe(m, profile, x=0, y=0, z=0, seg=32, name='lathe', rot=(0, 0, 0)):
    """Surface of revolution around local Z from a list of (radius, z) points."""
    bm = _bm()
    rings = []
    for i in range(seg):
        a = TAU * i / seg
        rings.append([bm.verts.new((rr * math.cos(a), rr * math.sin(a), zz)) for rr, zz in profile])
    for i in range(seg):
        r0 = rings[i]
        r1 = rings[(i + 1) % seg]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return _obj(name, bm, m, (x, y, z), rot)


def polar(n, radius, start=0.0):
    for i in range(n):
        a = start + TAU * i / n
        yield a, math.cos(a) * radius, math.sin(a) * radius


# ---------------------------------------------------------------------------
# Finalise + export
# ---------------------------------------------------------------------------

def _merge(objs, name, origin=Vector((0, 0, 0)), smooth_angle=34, space=None):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats = []
    tmp = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        tmp.append(me)
        me.transform((space if space is not None else Matrix.Translation(-origin)) @ ev.matrix_world)
        if me.uv_layers and me.uv_layers[0].name != 'UVMap':
            me.uv_layers[0].name = 'UVMap'
        if not me.uv_layers:
            me.uv_layers.new(name='UVMap')
        idx = []
        for mm in me.materials:
            if mm not in mats:
                mats.append(mm)
            idx.append(mats.index(mm))
        if idx:
            for p in me.polygons:
                p.material_index = idx[min(p.material_index, len(idx) - 1)]
        bm.from_mesh(me)
    for me in tmp:
        bpy.data.meshes.remove(me)
    # Smooth shading with hard edges above the angle (like "shade auto smooth").
    lim = math.radians(smooth_angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if not e.is_manifold or (len(e.link_faces) == 2 and e.calc_face_angle(0) > lim):
            e.smooth = False
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mm in mats:
        me.materials.append(mm)
    o = bpy.data.objects.new(name, me)
    o.location = origin
    return o


def finish(export=True):
    """Merge all parts into one mesh (+ one per spinning part) and export a GLB."""
    name = _state['name']
    src = _state['col']
    src.hide_viewport = False
    glb = bpy.data.collections['GLB_' + name]
    _clear_collection(glb)
    spin = [o for o in _state['spin'] if o.name in src.objects]
    static = [o for o in src.objects if o.type in ('MESH', 'CURVE') and o not in spin]
    body = _merge(static, name)
    glb.objects.link(body)
    outs = [body]
    for s in spin:
        # Keep the part's own rotation so its local Z (→ three.js local Y) is the spin axis.
        mw = s.matrix_world.copy()
        so = _merge([s], s.name, space=mw.inverted())
        so['spin'] = s['spin']
        glb.objects.link(so)
        so.parent = body
        so.matrix_parent_inverse = Matrix.Identity(4)
        so.matrix_world = mw
        outs.append(so)
    src.hide_viewport = True
    src.hide_render = True
    glb.hide_viewport = False
    glb.hide_render = False
    tris = sum(len(p.vertices) - 2 for o in outs for p in o.data.polygons)
    path = None
    if export:
        os.makedirs(OUT_DIR, exist_ok=True)
        path = os.path.join(OUT_DIR, name + '.glb')
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        for o in outs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = body
        vl = bpy.context.view_layer
        vl.active_layer_collection = vl.layer_collection.children[glb.name]
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            use_active_collection=True,
            use_active_scene=True,
            export_extras=True,
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
    return {'name': name, 'tris': tris, 'parts': len(static), 'spin': [s.name for s in spin], 'path': path,
            'kb': round(os.path.getsize(path) / 1024) if path else None}


def show_only(name):
    """Viewport/render only this building's GLB collection (for previews)."""
    for col in bpy.data.collections:
        if col.name.startswith('GLB_') or col.name.startswith('SRC_'):
            on = col.name == 'GLB_' + name
            col.hide_viewport = not on
            col.hide_render = not on


def preview(name, path, size=6.0, elev=38, azim=-50, res=(960, 720)):
    """Renders a quick EEVEE preview of one building to `path`."""
    scn = scene()
    show_only(name)
    cam = bpy.data.objects.get('PreviewCam')
    if cam is None:
        cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
        scn.collection.objects.link(cam)
    sun = bpy.data.objects.get('PreviewSun')
    if sun is None:
        sun = bpy.data.objects.new('PreviewSun', bpy.data.lights.new('PreviewSun', 'SUN'))
        scn.collection.objects.link(sun)
    sun.data.energy = 4.0
    sun.data.angle = math.radians(3)
    sun.rotation_euler = Euler((math.radians(50), 0, math.radians(-35)), 'XYZ')
    ground = bpy.data.objects.get('PreviewGround')
    if ground is None:
        me = bpy.data.meshes.new('PreviewGround')
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
        bm.to_mesh(me)
        bm.free()
        ground = bpy.data.objects.new('PreviewGround', me)
        scn.collection.objects.link(ground)
        me.materials.append(mat('preview_ground', '#b0603a', 0, 1))
    ground.location = (0, 0, -0.002)
    if scn.world is None:
        scn.world = bpy.data.worlds.new('PreviewWorld')
    scn.world.use_nodes = True
    bg = scn.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.55, 0.42, 0.36, 1)
        bg.inputs[1].default_value = 0.9
    e, a = math.radians(elev), math.radians(azim)
    dist = size * 2.1
    cam.location = (math.cos(e) * math.sin(a) * dist * -1, -math.cos(e) * math.cos(a) * dist, math.sin(e) * dist)
    direction = Vector((0, 0, size * 0.12)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    scn.camera = cam
    try:
        scn.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    scn.view_settings.view_transform = 'AgX'
    try:
        scn.eevee.taa_render_samples = 16
    except Exception:
        pass
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
