"""marslib - tiny procedural modelling kit used to build the Mars Colony Command asset pack.

Runs inside Blender's Python (tested with Blender 5.3):
    blender --background --python source/build_all.py

Authoring space is Blender's: +X east, +Y north, +Z up.  The glTF exporter converts to +Y up,
so a building's front (south) is Blender -Y  ==  glTF +Z.
A "spin" part's local +Z (Blender) becomes the node's local +Y in glTF.
"""
import bpy, bmesh, math, os, random
from contextlib import contextmanager
from mathutils import Matrix, Vector, Euler


# ----------------------------------------------------------------------------- palette
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


# name: (base colour, metallic, roughness, emissive colour, emissive strength, alpha)
PALETTE = {
    'hull_white': ('#e9e6df', 0.05, 0.42),
    'hull_offwhite': ('#d6d1c7', 0.05, 0.55),
    'panel_grey': ('#b9b5ad', 0.1, 0.6),
    'trim_orange': ('#e2622a', 0, 0.45),
    'trim_teal': ('#2aa596', 0, 0.45),
    'safety_yellow': ('#efb128', 0, 0.5),
    'signal_red': ('#c8322a', 0, 0.5),
    'steel': ('#a9b0b8', 0.85, 0.32),
    'aluminium': ('#c9ced3', 0.9, 0.25),
    'dark_metal': ('#373c44', 0.6, 0.45),
    'rubber_black': ('#1d1f23', 0, 0.85),
    'mli_gold': ('#d7a640', 1.0, 0.28),
    'copper': ('#b8703e', 1.0, 0.35),
    'sintered_regolith': ('#8f8072', 0, 0.95),
    'pad_regolith': ('#a39282', 0, 1.0),
    'loose_regolith': ('#a4532b', 0, 1.0),
    'regolith_dark': ('#7a3c1f', 0, 1.0),
    'regolith_bag': ('#9c6a48', 0, 0.95),
    'glass': ('#bfe3ff', 0, 0.05, None, 0, 0.22),
    'window_dark': ('#1c2b3a', 0.3, 0.08),
    'window_warm': ('#2a2015', 0, 0.2, '#ffcf8a', 1.6),
    'glow_cyan': ('#000000', 0, 1, '#5ff3ff', 2.2),
    'glow_orange': ('#000000', 0, 1, '#ff8a2a', 2.2),
    'glow_green': ('#000000', 0, 1, '#6dff8a', 2.2),
    'glow_red': ('#000000', 0, 1, '#ff3b3b', 2.2),
    'glow_white': ('#000000', 0, 1, '#fff1d6', 2.2),
    # --- additions not in the brief's table (documented in README) ---
    'solar_blue': ('#1b3466', 0.5, 0.22),      # photovoltaic cells
    'band_blue': ('#2f6fd0', 0, 0.45),         # "water" colour band
    'scorch_black': ('#2b2420', 0, 1.0),       # engine scorch marks
}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    spec = PALETTE[name]
    hx, met, rough = spec[:3]
    em = spec[3] if len(spec) > 3 else None
    es = spec[4] if len(spec) > 4 else 0
    alpha = spec[5] if len(spec) > 5 else 1
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*hexrgb(hx), 1)
    b.inputs['Metallic'].default_value = met
    b.inputs['Roughness'].default_value = rough
    if em:
        b.inputs['Emission Color'].default_value = (*hexrgb(em), 1)
        b.inputs['Emission Strength'].default_value = es
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    m.diffuse_color = (*hexrgb(em or hx), 1)
    return m


# ----------------------------------------------------------------------------- transforms
def T(x=0, y=0, z=0):
    return Matrix.Translation((x, y, z))


def R(rx=0, ry=0, rz=0):
    return Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_matrix().to_4x4()


def align(p0, p1):
    """Matrix that puts the origin at p0 and local +Z along p0->p1."""
    d = Vector(p1) - Vector(p0)
    return T(*p0) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()


# ----------------------------------------------------------------------------- raw geometry
_box_cache = {}


def box_geo(sx, sy, sz, bevel):
    key = (round(sx, 5), round(sy, 5), round(sz, 5), round(bevel, 5))
    if key in _box_cache:
        return _box_cache[key]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((sx, sy, sz, 1)))
    if bevel > 0:
        b = min(bevel, 0.45 * min(sx, sy, sz))
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=b, offset_type='OFFSET', segments=1,
                        profile=0.5, affect='EDGES')
    bm.normal_update()
    bm.verts.index_update()
    V = [v.co.copy() for v in bm.verts]
    F = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    _box_cache[key] = (V, F)
    return V, F


def lathe_geo(profile, seg=16, close=False, a0=0.0, a1=360.0):
    """Revolve (r, z) profile around Z.  List the profile bottom->top along the OUTSIDE.
    close=True joins last point back to first (rings / tyres).  a0/a1 make a partial sweep."""
    full = abs((a1 - a0) - 360.0) < 1e-6
    n_ring = seg if full else seg + 1
    V, rings = [], []
    for r, z in profile:
        if r < 1e-7:
            rings.append([len(V)])
            V.append(Vector((0, 0, z)))
        else:
            rings.append(list(range(len(V), len(V) + n_ring)))
            for j in range(n_ring):
                a = math.radians(a0 + (a1 - a0) * j / seg)
                V.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    F = []
    n = len(rings)
    pairs = [(i, i + 1) for i in range(n - 1)] + ([(n - 1, 0)] if close else [])
    for i, k in pairs:
        A, B = rings[i], rings[k]
        if len(A) == 1 and len(B) == 1:
            continue
        for j in range(seg):
            j2 = (j + 1) % n_ring if full else j + 1
            if len(A) == 1:
                F.append((A[0], B[j2], B[j]))
            elif len(B) == 1:
                F.append((A[j], A[j2], B[0]))
            else:
                F.append((A[j], A[j2], B[j2], B[j]))
    if not full and close:
        F.append(tuple(rg[0] for rg in rings))
        F.append(tuple(rg[-1] for rg in reversed(rings)))
    return V, F


def extrude_geo(pts, h):
    """Prism from a CCW polygon in XY, z = 0..h."""
    n = len(pts)
    V = [Vector((x, y, 0)) for x, y in pts] + [Vector((x, y, h)) for x, y in pts]
    F = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        F.append((i, j, n + j, n + i))
    return V, F


# ----------------------------------------------------------------------------- Part (= one glTF node)
class Part:
    def __init__(self, name, loc=(0, 0, 0), rot=(0, 0, 0), spin=None, dust=False):
        self.name, self.loc, self.rot, self.spin, self.dust = name, loc, rot, spin, dust
        self.V, self.F, self.FM, self.mats = [], [], [], []
        self.stack = [Matrix.Identity(4)]

    # -- transform stack
    @property
    def M(self):
        return self.stack[-1]

    @contextmanager
    def at(self, x=0, y=0, z=0, rz=0, rx=0, ry=0, s=1):
        self.stack.append(self.M @ T(x, y, z) @ R(rx, ry, rz) @ Matrix.Scale(s, 4))
        try:
            yield self
        finally:
            self.stack.pop()

    def _add(self, V, F, mat, L=None):
        M = self.M @ L if L is not None else self.M
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        o = len(self.V)
        self.V.extend(M @ v for v in V)
        flip = M.determinant() < 0
        for f in F:
            f = tuple(o + i for i in f)
            self.F.append(tuple(reversed(f)) if flip else f)
            self.FM.append(mi)

    # -- primitives
    def box(self, mat, c, s, rot=(0, 0, 0), bevel=0.02):
        V, F = box_geo(s[0], s[1], s[2], bevel)
        self._add(V, F, mat, T(*c) @ R(*rot))

    def boxz(self, mat, x, y, z0, sx, sy, h, bevel=0.02, rz=0):
        self.box(mat, (x, y, z0 + h / 2), (sx, sy, h), (0, 0, rz), bevel)

    def lathe(self, mat, profile, seg=16, L=None, close=False, a0=0.0, a1=360.0):
        V, F = lathe_geo(profile, seg, close, a0, a1)
        self._add(V, F, mat, L)

    def cyl(self, mat, p0, p1, r, r2=None, seg=12, caps=True):
        r2 = r if r2 is None else r2
        Lh = (Vector(p1) - Vector(p0)).length
        prof = [(r, 0), (r2, Lh)]
        if caps:
            prof = [(0, 0)] + prof + [(0, Lh)]
        self.lathe(mat, prof, seg, align(p0, p1))

    def cylz(self, mat, x, y, z0, h, r, seg=16, r2=None, b=0.0):
        r2 = r if r2 is None else r2
        prof = [(0, 0), (r, 0)] + ([(r2, h - b), (r2 - b, h)] if b else [(r2, h)]) + [(0, h)]
        self.lathe(mat, prof, seg, T(x, y, z0))

    def sphere(self, mat, c, r, seg=16, rings=8, sz=1.0, sx=1.0, sy=1.0):
        prof = [(r * math.cos(a), r * math.sin(a))
                for a in (math.radians(-90 + 180 * i / rings) for i in range(rings + 1))]
        prof[0], prof[-1] = (0, -r), (0, r)
        self.lathe(mat, prof, seg, T(*c) @ Matrix.Diagonal((sx, sy, sz, 1)))

    def dome(self, mat, c, r, h=None, seg=16, rings=4):
        h = r if h is None else h
        prof = [(0, 0)] + [(r * math.cos(a), h * math.sin(a))
                           for a in (math.radians(90 * i / rings) for i in range(rings))] + [(0, h)]
        self.lathe(mat, prof, seg, T(*c))

    def capsule(self, mat, p0, p1, r, seg=16, rings=4):
        """Cylinder p0->p1 with hemispherical ends beyond p0 and p1."""
        Lh = (Vector(p1) - Vector(p0)).length
        prof = [(0, -r)]
        prof += [(r * math.cos(a), r * math.sin(a))
                 for a in (math.radians(-90 + 90 * i / rings) for i in range(1, rings + 1))]
        prof += [(r * math.cos(a), Lh + r * math.sin(a))
                 for a in (math.radians(90 * i / rings) for i in range(0, rings))]
        prof += [(0, Lh + r)]
        self.lathe(mat, prof, seg, align(p0, p1))

    def pipe(self, mat, pts, r, seg=8, joints=True):
        for a, b in zip(pts[:-1], pts[1:]):
            self.cyl(mat, a, b, r, seg=seg)
        if joints:
            for p in pts[1:-1]:
                self.sphere(mat, p, r * 1.02, seg=seg, rings=4)

    def extrude(self, mat, pts, z0, h, L=None):
        V, F = extrude_geo(pts, h)
        self._add(V, F, mat, (L or Matrix.Identity(4)) @ T(0, 0, z0))

    def ring(self, mat, r0, r1, z0, h, seg=24, c=(0, 0), a0=0.0, a1=360.0):
        """Flat annulus (or arc of one) with rectangular section."""
        self.lathe(mat, [(r0, 0), (r1, 0), (r1, h), (r0, h)], seg, T(c[0], c[1], z0), close=True, a0=a0, a1=a1)

    def dish(self, mat, r, depth, L, seg=20, th=0.015, rings=4):
        """Parabolic dish opening towards local +Z, vertex at L's origin."""
        outer = [(r * i / rings, depth * (i / rings) ** 2 - th) for i in range(rings + 1)]
        inner = [(r * i / rings, depth * (i / rings) ** 2) for i in range(rings, -1, -1)]
        outer[0] = (0, -th)
        inner[-1] = (0, 0)
        self.lathe(mat, outer + inner, seg, L)

    # -- output
    def matrix(self):
        return T(*self.loc) @ R(*self.rot)

    def finalize(self):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.V], [], self.F)
        for n in self.mats:
            me.materials.append(material(n))
        me.polygons.foreach_set('material_index', self.FM)
        me.polygons.foreach_set('use_smooth', [True] * len(self.F))
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        lim = math.radians(40)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
                e.smooth = False
        bm.to_mesh(me)
        bm.free()
        if self.dust:
            ca = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
            tint = (1.0, 0.74, 0.58)
            cols = []
            for v in me.vertices:
                t = 0.7 * min(1.0, max(0.0, 1.0 - v.co.z / 0.6))
                cols += [1 + (tint[0] - 1) * t, 1 + (tint[1] - 1) * t, 1 + (tint[2] - 1) * t, 1.0]
            ca.data.foreach_set('color', cols)
            me.color_attributes.active_color = ca
            try:
                me.color_attributes.render_color_index = 0
            except Exception:
                pass
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.loc
        ob.rotation_euler = [math.radians(a) for a in self.rot]
        if self.spin is not None:
            ob['spin'] = float(self.spin)
        bpy.context.scene.collection.objects.link(ob)
        return ob

    def tris(self):
        return sum(len(f) - 2 for f in self.F)


# ----------------------------------------------------------------------------- Model (= one .glb)
class Model:
    def __init__(self, id, kind, footprint=None, size=None, front='+Z (south)', notes='', subdir=''):
        self.id, self.kind, self.footprint, self.size = id, kind, footprint, size
        self.front, self.notes, self.subdir = front, notes, subdir
        self.root = Part(id, dust=(kind == 'building'))
        self.parts = [self.root]

    def spin(self, name, loc, rot=(0, 0, 0), speed=1.0):
        p = Part(name, loc, rot, spin=speed)
        self.parts.append(p)
        return p

    def export(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        root = None
        for part in self.parts:
            ob = part.finalize()
            if root is None:
                root = ob
            else:
                ob.parent = root
        want = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                    export_extras=True, export_cameras=False, export_lights=False,
                    export_animations=False, export_skins=False, export_morph=False,
                    export_texcoords=False, export_normals=True, export_tangents=False,
                    export_materials='EXPORT', export_vertex_color='ACTIVE',
                    export_active_vertex_color_when_no_material=True,
                    export_draco_mesh_compression_enable=False, use_selection=False)
        props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
        bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for part in self.parts:
            Mx = part.matrix()
            for v in part.V:
                w = Mx @ v
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], w[i]), max(hi[i], w[i])
        mats = []
        for part in self.parts:
            for n in part.mats:
                if n not in mats:
                    mats.append(n)
        st = dict(file=('models/' + (self.subdir + '/' if self.subdir else '') + self.id + '.glb'),
                  id=self.id, kind=self.kind,
                  height=round(hi.z, 2), triangles=sum(p.tris() for p in self.parts),
                  bytes=os.path.getsize(path),
                  spin_nodes=[dict(node=p.name, speed=p.spin) for p in self.parts if p.spin is not None],
                  materials=mats, front=self.front, notes=self.notes,
                  nodes=len(self.parts),
                  bounds=[[round(lo.x, 3), round(lo.y, 3), round(lo.z, 3)], [round(hi.x, 3), round(hi.y, 3), round(hi.z, 3)]])
        if self.footprint:
            st['footprint'] = list(self.footprint)
        if self.size:
            st['size'] = list(self.size)
        return st


# ----------------------------------------------------------------------------- shared sub-assemblies
def plinth(p, w, d, top=0.08, mat='sintered_regolith'):
    """Foundation slab from y=-0.65 up to `top`, plus a pad surface."""
    p.boxz(mat, 0, 0, -0.65, w, d, 0.65 + top, bevel=0.04)
    p.boxz('pad_regolith', 0, 0, top, w - 0.3, d - 0.3, 0.04, bevel=0.012)
    return top + 0.04


def ladder(p, x, y, z0, h, rz=0, w=0.2, mat='safety_yellow'):
    with p.at(x, y, z0, rz=rz):
        for sx in (-w / 2, w / 2):
            p.boxz(mat, sx, 0, 0, 0.025, 0.025, h, bevel=0)
        n = max(2, int(h / 0.15))
        for i in range(1, n + 1):
            p.boxz(mat, 0, 0, i * h / (n + 1), w, 0.018, 0.018, bevel=0)


def railing(p, pts, h=0.26, mat='safety_yellow', r=0.012):
    for a in pts:
        p.cyl(mat, a, (a[0], a[1], a[2] + h), r, seg=6)
    for a, b in zip(pts[:-1], pts[1:]):
        for k in (1.0, 0.5):
            p.cyl(mat, (a[0], a[1], a[2] + h * k), (b[0], b[1], b[2] + h * k), r * 0.85, seg=6, caps=False)


def crate(p, x, y, z0, s=0.4, mat='hull_offwhite', trim='trim_orange', rz=0, h=None):
    h = s if h is None else h
    with p.at(x, y, z0, rz=rz):
        p.boxz(mat, 0, 0, 0, s, s, h, bevel=0.02)
        p.boxz(trim, 0, 0, h * 0.62, s + 0.012, s + 0.012, h * 0.16, bevel=0.004)
        p.boxz('dark_metal', 0, 0, h, s * 0.55, s * 0.55, 0.012, bevel=0)
        for sx in (-1, 1):
            for sy in (-1, 1):
                p.boxz('dark_metal', sx * (s / 2 - 0.02), sy * (s / 2 - 0.02), 0, 0.05, 0.05, h + 0.006, bevel=0.006)


def barrel(p, x, y, z0, r=0.15, h=0.42, mat='trim_teal'):
    p.cylz(mat, x, y, z0, h, r, seg=14, b=0.015)
    for k in (0.28, 0.72):
        p.cylz('steel', x, y, z0 + h * k - 0.012, 0.024, r + 0.008, seg=14)
    p.cylz('dark_metal', x + r * 0.45, y, z0 + h, 0.012, r * 0.18, seg=8)


def fan(p, r, n=5, blade='aluminium', hub='dark_metal'):
    """Fan rotor around local Z, centred on the part origin."""
    p.cylz(hub, 0, 0, -0.035, 0.07, r * 0.24, seg=12, b=0.01)
    for i in range(n):
        with p.at(rz=i * 360 / n):
            p.box(blade, (r * 0.6, 0, 0), (r * 0.78, r * 0.34, 0.012), rot=(24, 0, 0), bevel=0)


def wheel(p, r, w, tyre='aluminium', hub='dark_metal', spoke='steel', cleat='dark_metal', n_cleats=12, n_spokes=6,
          disc=None):
    """Wheel around local Z (axle), centred on the part origin."""
    b = min(0.02, w * 0.18)
    if disc:
        p.cylz(disc, 0, 0, -w * 0.2, w * 0.4, r * 0.72, seg=20)
    p.lathe(tyre, [(r * 0.7, -w / 2), (r - b, -w / 2), (r, -w / 2 + b), (r, w / 2 - b), (r - b, w / 2), (r * 0.7, w / 2)],
            seg=20, close=True)
    p.cylz(hub, 0, 0, -w * 0.36, w * 0.72, r * 0.26, seg=12, b=0.008)
    for i in range(n_spokes):
        with p.at(rz=i * 360 / n_spokes):
            p.box(spoke, (r * 0.48, 0, 0), (r * 0.5, r * 0.11, w * 0.5), bevel=0)
    for i in range(n_cleats):
        with p.at(rz=(i + 0.5) * 360 / n_cleats):
            p.box(cleat, (r + 0.002, 0, 0), (0.018, r * 0.16, w * 0.94), bevel=0)


def tank_v(p, x, y, z0, r, h, band='trim_teal', body='hull_white', glow=None):
    """Vertical capsule tank standing on a skirt; h = total height above z0."""
    p.cylz('dark_metal', x, y, z0, 0.16, r * 0.8, seg=14)
    p.capsule(body, (x, y, z0 + 0.1 + r), (x, y, z0 + h - r), r, seg=16, rings=4)
    p.cylz(band, x, y, z0 + h * 0.58, r * 0.5, r + 0.006, seg=16)
    p.cylz('steel', x, y, z0 + h - 0.02, 0.07, r * 0.28, seg=10)
    if glow:
        p.cylz(glow, x, y, z0 + h + 0.05, 0.02, r * 0.2, seg=10)


def rock_geo(seed, r, sx=1.0, sy=1.0, sz=0.7, seg=8, rings=5, rough=0.28):
    rnd = random.Random(seed)
    prof = [(math.cos(a), math.sin(a)) for a in (math.radians(-90 + 180 * i / rings) for i in range(rings + 1))]
    prof[0], prof[-1] = (0, -1), (0, 1)
    V, F = lathe_geo(prof, seg)
    out = []
    for v in V:
        k = r * (1 + rnd.uniform(-rough, rough))
        out.append(Vector((v.x * k * sx, v.y * k * sy, v.z * k * sz)))
    return out, F


def rock(p, mat, x, y, z, r, seed, **kw):
    V, F = rock_geo(seed, r, **kw)
    p._add(V, F, mat, T(x, y, z) @ R(0, 0, seed * 47 % 360))
