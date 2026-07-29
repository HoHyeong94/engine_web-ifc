// gen_rust_emitter.js — GENERATED IFC emitter for the gvcs-ifc storage redesign (Phase P4).
//
// Standalone Node generator (no TS toolchain needed). It is the retarget of
// rust/gen_rust_emit.ts: it REUSES the vendored .exp parser logic
// (parseElements / sortEntities / walkParents / findSubClasses / crc32 —
// ported verbatim from gen_functional_types_helpers.ts) and DISCARDS the old
// `Value` enum + `emitToRaw`/`emitFromRaw` transmute stubs.
//
// For every entity of the requested schema(s) it emits, over the real
// `crate::ffi::ffi::IfcArgument`:
//   * `pub struct <Name>` with owned typed / `IfcValue` fields in full inherited
//     EXPRESS order (inverse attrs skipped; SELF\ DERIVE slots are NOT fields
//     but serialize as `*` at their positions),
//   * `fn from_arguments(line: &Line) -> Option<Self>` (port of generatePropAssignment),
//   * `fn write_step(&self, id, out: &mut String, resolve)` — the SINGLE-PASS
//     serializer, and since S4 the ONLY one: it appends the whole
//     `#id=KEYWORD(...);` line to a String with no IfcArgument tree in between.
//
//     S0-S3 emitted a SECOND writer beside it, `to_arguments(&self) ->
//     Vec<IfcArgument>` (a port of generateTapeAssignment) whose token tree fed
//     `step_text::line_to_step`. The two were gated against each other over the
//     whole corpus — 18,969,505 covered lines, 100.00000% byte-identical, both
//     schemas — and the two-pass road then measured at 1.87x the single-pass
//     emit cost, so S4 retired it. `line_to_step` itself is NOT retired: it
//     still serializes engine `Line`s for `ownership.rs` and the default export
//     text tier, and the always-on fixtures in
//     gvcs-ifc/tests/emitter_write_step_ab.rs still cross-check `write_step`
//     against it over hand-built lines. The byte-level corpus authority is
//     gvcs-ifc/tests/emitter_golden.rs, which compares this writer's output
//     against the ENGINE's own serialization,
//   * type-code CRC assoc consts,
// plus, per schema, one Rust enum per EXPRESS `ENUMERATION` — and, since S2, per
// SYNTHETIC enumeration: `IfcBoolean` (T/F) and `IfcLogical` (T/F/U), so a
// BOOLEAN or LOGICAL attribute slot can no longer hold an arbitrary string,
// plus a per-schema `AnyEntity` wrapper enum, a `from_line(line)->Option<AnyEntity>`
// dispatch, and a `type_name_of(type_code)->Option<&'static str>` table.
//
// The value model (`IfcValue`, hand-written in generated/mod.rs) mirrors how the
// wrapper's get_args / meta.rs shape IfcArgument, and feeds step_text::line_to_step.
//
// Usage:  node gen_rust_emitter.js <outDir> [SCHEMA ...]
//   e.g.  node gen_rust_emitter.js d:/.../gvcs-ifc/src/generated IFC4 IFC2X3
//   default schema: IFC4
//
// Deterministic: stable ordering (sortEntities is topological + stable), so
// regeneration is diffable.

"use strict";
const fs = require("fs");
const path = require("path");

// ----------------------------------------------------------------------------
// CRC32 (ported verbatim from gen_functional_types_helpers.ts) — MUST match the
// engine's IFC type codes (crc32 of the UPPER-CASE type name).
// ----------------------------------------------------------------------------
function makeCRCTable() {
    let c;
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[n] = c;
    }
    return crcTable;
}
const CRC_TABLE = makeCRCTable();
function crc32(str) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

// ----------------------------------------------------------------------------
// .exp type helpers (ported verbatim)
// ----------------------------------------------------------------------------
function expTypeToTSType(t) {
    if (t === "REAL" || t === "NUMBER" || t === "INTEGER") return "number";
    if (t === "STRING") return "string";
    if (t === "BOOLEAN") return "boolean";
    if (t === "BINARY") return "number";
    if (t === "LOGICAL") return "logical";
    return t;
}
function expTypeToTypeNum(t) {
    if (t === "INTEGER") return 10;
    if (t === "REAL" || t === "NUMBER") return 4;
    if (t === "STRING") return 1;
    if (t === "BOOLEAN") return 3;
    if (t === "BINARY") return 4;
    if (t === "LOGICAL") return 3;
    return 5;
}

// ----------------------------------------------------------------------------
// parseElements / parseInverse / parseDerived (ported verbatim)
// ----------------------------------------------------------------------------
function parseInverse(line, entity) {
    const split = line.split(" ");
    const name = split[0].replace("INVERSE", "").trim();
    const set = split.indexOf("SET") !== -1 || split.indexOf("LIST") !== -1;
    const forVal = split[split.length - 1].replace(";", "");
    const type = split[split.length - 3];
    entity.inverseProps.push({ name, type: expTypeToTSType(type), set, for: forVal });
}
function parseDerived(line, entity) {
    line = line.replace("DERIVE", "").trim();
    const lineChunks = line.split(" ");
    if (lineChunks[0].trim().startsWith("SELF")) {
        const split = lineChunks[0].split(".");
        entity.ifcDerivedProps.push(split[1]);
    }
}
function parseElements(data) {
    const lines = data.split(";");
    const entities = [];
    const types = [];
    let type = false;
    let entity = false;
    let readProps = false, readInverse = false, readIfcDerived = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const hasColon = line.indexOf(" : ") !== -1;
        if (line.indexOf("ENTITY") === 0) {
            const split = line.split(" ");
            const name = split[1].trim();
            entity = { name, parent: null, props: [], children: [], derivedProps: [], inverseProps: [], derivedInverseProps: [], isIfcProduct: false, ifcDerivedProps: [] };
            if (name === "IfcProduct") entity.isIfcProduct = true;
            readProps = true; readInverse = false; readIfcDerived = false;
            const subIndex = split.indexOf("SUBTYPE");
            if (subIndex !== -1) entity.parent = split[subIndex + 2].replace("(", "").replace(")", "");
        } else if (line.indexOf("END_ENTITY") === 0) {
            if (entity) entities.push(entity);
            readProps = false; readInverse = false; readIfcDerived = false;
        } else if (line.indexOf("WHERE") === 0) {
            readProps = false; readInverse = false; readIfcDerived = false;
        } else if (line.indexOf("INVERSE") === 0) {
            readProps = false; readInverse = true; readIfcDerived = false;
            if (entity) parseInverse(line, entity);
        } else if (line.indexOf("DERIVE") === 0) {
            readProps = false; readInverse = false; readIfcDerived = true;
            if (entity) parseDerived(line, entity);
        } else if (line.indexOf("UNIQUE") === 0) {
            readProps = false; readInverse = false; readIfcDerived = false;
        } else if (line.indexOf("TYPE") === 0) {
            readProps = false; readInverse = false; readIfcDerived = false;
            const split = line.split(" ").map((s) => s.trim());
            const name = split[1];
            const isList = split.indexOf("LIST") !== -1 || split.indexOf("SET") !== -1 || split.indexOf("ARRAY") !== -1;
            const isEnum = split.indexOf("ENUMERATION") !== -1;
            const isSelect = split[3].indexOf("SELECT") === 0;
            let values = [];
            let typeName = "";
            if (isList) {
                typeName = split[split.length - 1];
            } else if (isEnum || isSelect) {
                const firstBracket = line.indexOf("(");
                const secondBracket = line.indexOf(")");
                values = line.substring(firstBracket + 1, secondBracket).split(",").map((s) => s.trim());
            } else {
                typeName = split[3];
            }
            const fb = typeName.indexOf("(");
            if (fb !== -1) typeName = typeName.substr(0, fb);
            // S3: keep the UNMAPPED EXPRESS spelling of the aliased type.
            // `expTypeToTSType` on the next line collapses REAL, INTEGER,
            // NUMBER and BINARY all onto the single string "number", so the
            // mapped name cannot tell an INTEGER defined type from a REAL one —
            // and that distinction is the entire subject of S3. Additive: the
            // mapped `typeName` is untouched, so every pre-S3 consumer reads
            // exactly what it read before.
            const rawTypeName = typeName;
            const typeNum = expTypeToTypeNum(typeName);
            typeName = expTypeToTSType(typeName);
            type = { name, typeName, rawTypeName, typeNum, isList, isEnum, isSelect, values };
        } else if (line.indexOf("END_TYPE") === 0) {
            if (type) types.push(type);
            type = false;
        } else if (entity && readInverse && hasColon) {
            parseInverse(line, entity);
        } else if (entity && readIfcDerived && hasColon) {
            parseDerived(line, entity);
        } else if (entity && readProps && hasColon) {
            const split = line.split(" ");
            const name = split[0];
            let optional = split.indexOf("OPTIONAL") !== -1;
            const set = split.indexOf("SET") !== -1 || split.indexOf("LIST") !== -1;
            let dimensions = 0;
            if (set && !optional) {
                let setLoc = split.indexOf("SET");
                if (setLoc === -1) setLoc = split.indexOf("LIST");
                if (split[setLoc + 1] && split[setLoc + 1].includes("[0:")) optional = true;
            }
            if (set) dimensions = (line.match(/LIST/g) || []).length;
            let t = split[split.length - 1].replace(";", "");
            const fb = t.indexOf("(");
            if (fb !== -1) t = t.substr(0, fb);
            const tsType = expTypeToTSType(t);
            // S3: the VERBATIM declaration text after the colon, whitespace-
            // normalised. Every field computed above is lossy for the question
            // S3 has to answer, and two of them are lossy in ways that would
            // MIS-TYPE a slot rather than merely fail to type it:
            //   * `set` tests only for SET/LIST, so
            //     `IfcMaterialLayerWithOffsets.OffsetValues : ARRAY [1:2] OF
            //     IfcLengthMeasure` reads as a SCALAR — typing it `f64` would
            //     have turned a two-element aggregate into one number;
            //   * `type` keeps only the innermost token and drops every bound,
            //     so a `LIST [1:?] OF LIST [3:3] OF X` is indistinguishable
            //     from a plain `X`.
            // The S3 classifier therefore re-parses this string and trusts none
            // of them. `multiline` is a guard: no attribute in IFC4/IFC2X3
            // spans lines (measured: 0 in both), and if one ever does, the
            // classifier drops the slot to `IfcValue` rather than guess.
            const rawDecl = line.slice(line.indexOf(" : ") + 3).trim().replace(/\s+/g, " ");
            entity.props.push({
                name, type: tsType, typeNum: expTypeToTypeNum(t), primitive: tsType !== t,
                optional, set, dimensions, rawDecl, multiline: /[\r\n]/.test(line),
            });
        }
    }
    return { entities, types };
}

function findEntity(name, list) {
    if (name == null) return null;
    for (const e of list) if (e.name === name) return e;
    return null;
}
function sortEntities(entities) {
    const sorted = [];
    let unsorted = entities.slice();
    while (unsorted.length > 0) {
        for (let i = 0; i < unsorted.length; i++) {
            if (unsorted[i].parent == null || sorted.some((e) => e.name === unsorted[i].parent)) sorted.push(unsorted[i]);
        }
        unsorted = unsorted.filter((n) => !sorted.includes(n));
    }
    return sorted;
}
function findSubClasses(entities) {
    for (let y = entities.length - 1; y >= 0; y--) {
        const parent = findEntity(entities[y].parent, entities);
        if (parent == null) continue;
        parent.children.push(...entities[y].children);
        parent.children.push(entities[y].name);
    }
    return entities;
}
function walkParents(entity, list) {
    const parent = findEntity(entity.parent, list);
    if (parent == null) {
        entity.derivedProps = entity.props;
        entity.derivedInverseProps = entity.inverseProps;
    } else {
        walkParents(parent, list);
        if (parent.isIfcProduct) entity.isIfcProduct = true;
        entity.derivedProps = [...parent.derivedProps, ...entity.props];
        entity.derivedInverseProps = [...parent.derivedInverseProps, ...entity.inverseProps];
    }
}

// ----------------------------------------------------------------------------
// Rust identifier helpers
// ----------------------------------------------------------------------------
const RUST_RESERVED = new Set([
    "as", "break", "const", "continue", "crate", "else", "enum", "extern", "false",
    "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut",
    "pub", "ref", "return", "self", "Self", "static", "struct", "super", "trait",
    "true", "type", "unsafe", "use", "where", "while", "dyn", "async", "await", "try",
    "abstract", "become", "box", "do", "final", "macro", "override", "priv", "typeof",
    "unsized", "virtual", "yield", "union",
]);
function rsIdent(s) {
    const safe = s.replace(/[^A-Za-z0-9_]/g, "_");
    return RUST_RESERVED.has(safe) ? `${safe}_` : safe;
}
function fieldIdent(name, used) {
    // lower-case + sanitize; guard reserved; dedupe within an entity.
    let base = rsIdent(name.toLowerCase());
    if (/^[0-9]/.test(base)) base = "f_" + base;
    let cand = base;
    let n = 1;
    while (used.has(cand)) { cand = `${base}_${n}`; n++; }
    used.add(cand);
    return cand;
}

// ----------------------------------------------------------------------------
// S2 — BOOLEAN / LOGICAL entity-attribute slots as GENERATED enums
// ----------------------------------------------------------------------------
// EXPRESS declares `TYPE IfcBoolean = BOOLEAN;` and `TYPE IfcLogical = LOGICAL;`.
// Both are CLOSED value sets (`.T.`/`.F.`, and `.T.`/`.F.`/`.U.`), but neither is
// an `ENUMERATION` declaration, so nothing in this generator picked them up: every
// such slot was emitted as a bare `IfcValue`, i.e. a from-zero writer could put
// any string at all in a boolean slot.
//
// S2 injects them as SYNTHETIC enumerations. They then flow through the SAME
// machinery a real ENUMERATION does — `from_literal` / `as_literal` / `to_arg` /
// `write_value` / `is_foreign` / the `Other(IfcValue)` catch-all — with no
// second code path to keep in step.
//
// Read side: the parser stores `.T.`/`.F.`/`.U.` as `IfcValue::Enum("T"|"F"|"U")`,
// so those BARE names are exactly what `from_literal` accepts. Anything else —
// `.U.` in a BOOLEAN slot (schema-illegal, present in real files), a quoted
// STRING like `'.BEND.'`, `$`, `*`, a number — lands in `Other(IfcValue)` and
// re-emits byte-identically. `.U.` in a LOGICAL slot is a FIRST-CLASS `U`.
const SYNTH_ENUMS = [
    { name: "IfcBoolean", values: ["T", "F"] },
    { name: "IfcLogical", values: ["T", "F", "U"] },
];
const SYNTH_ENUM_NAMES = new Set(SYNTH_ENUMS.map((t) => t.name));

// Every spelling an attribute slot uses for these two types, mapped to the one
// generated enum it must resolve to. A slot may name the DEFINED TYPE
// (`IfcBoolean`) or the PRIMITIVE (`BOOLEAN`), which `expTypeToTSType` has
// already lowered to `boolean` / `logical` by the time a prop descriptor exists.
// Covering only one spelling would type one schema and miss the other: IFC4
// spells almost everything with the defined types, IFC2X3 almost everything raw.
const SYNTH_ENUM_BY_SPELLING = new Map([
    ["IfcBoolean", "IfcBoolean"],
    ["boolean", "IfcBoolean"],
    ["IfcLogical", "IfcLogical"],
    ["logical", "IfcLogical"],
]);

// Count, then REWRITE, every BOOLEAN/LOGICAL attribute slot to its synthetic
// enum name, and install the two synthetic types in the schema's type table.
//
// Called after `walkParents`, so `derivedProps` already exists — it holds the
// SAME prop objects as the owning entity's `props`, which is why rewriting
// `props` is enough (the second pass is idempotent belt-and-braces).
function injectSyntheticEnums(entities, types) {
    // -- census (BEFORE the rewrite, or every spelling would read as its target)
    const census = new Map(); // spelling -> { declared, flattened }
    const bump = (key, which) => {
        if (!census.has(key)) census.set(key, { declared: 0, flattened: 0 });
        census.get(key)[which]++;
    };
    for (const e of entities) {
        for (const p of e.props) if (SYNTH_ENUM_BY_SPELLING.has(p.type)) bump(p.type, "declared");
        for (const p of e.derivedProps || []) {
            if (SYNTH_ENUM_BY_SPELLING.has(p.type)) bump(p.type, "flattened");
        }
    }

    // -- rewrite
    const rewrite = (props) => {
        for (const p of props || []) {
            const target = SYNTH_ENUM_BY_SPELLING.get(p.type);
            if (target) p.type = target;
        }
    };
    for (const e of entities) {
        rewrite(e.props);
        rewrite(e.derivedProps);
    }

    // -- install the synthetic types, IN PLACE where the .exp declared the
    //    defined type, so regeneration stays diffable.
    for (const s of SYNTH_ENUMS) {
        const synth = {
            name: s.name,
            typeName: s.name,
            typeNum: 3,
            isList: false,
            isEnum: true,
            isSelect: false,
            values: s.values.slice(),
            synthetic: true,
        };
        const idx = types.findIndex((t) => t.name === s.name);
        if (idx >= 0) types[idx] = synth;
        else types.push(synth);
    }
    return census;
}

// ----------------------------------------------------------------------------
// S3 — TYPED PRIMITIVE SLOTS + the per-entity RESIDUAL side-channel
// ----------------------------------------------------------------------------
// Before S3 every non-enum attribute slot was a `IfcValue`, a twelve-variant
// tagged union: an INTEGER slot could hold a list, a REAL slot a string. S3
// gives a slot whose EXPRESS type resolves to a primitive the Rust primitive:
// `i64`, `String`, `f64`, `Vec<f64>`, `Vec<[f64; 3]>`, … (`Option<T>` when the
// attribute is OPTIONAL).
//
// ## The residual side-channel — why byte-identity is STRUCTURAL, not hoped for
// Real files put values in slots the schema does not allow there. The pre-S3
// code kept whatever arrived and re-emitted it verbatim; a typed field cannot,
// because the value does not fit. So every entity carries
//
//     pub residual: Vec<(u8, IfcValue)>          // slot index -> ORIGINAL value
//
// and `from_arguments` routes ANY token that does not conform to the slot's
// typed representation into it, leaving the typed field at a documented
// SENTINEL (`0` / `0.0` / `String::new()` / `Vec::new()` / `None`). The writer
// consults the residual FIRST for every typed slot and re-emits the ORIGINAL
// `IfcValue` through the very same `write_ifc_value` the pre-S3 code used. (Up
// to S3 there were TWO writers and BOTH consulted it; S4 retired the
// `to_arguments` one.) A mismatched slot's bytes
// are therefore identical to the pre-S3 bytes BY CONSTRUCTION, not by luck:
// the sentinel is UNSERIALISABLE — no writer can ever reach it, because the
// residual entry that put it there always wins.
//
// An empty `Vec` allocates nothing, so a conforming entity pays 24 bytes of
// inline header and zero heap.
//
// One sentinel deserves a note, because it looks like a collision and is not.
// A STRING slot's sentinel is `String::new()` — which is ALSO a perfectly legal
// value, the file's `''`. Nothing is ambiguous, because the RESIDUAL decides
// and the sentinel never does: an empty string parses as a CONFORMING
// `IfcValue::Str("")`, pushes no residual entry, and writes `''`; a
// non-conforming token pushes an entry that every writer consults first. The
// sentinel is unreachable in the second case and irrelevant in the first. This
// is exactly why the design keys on "is there a residual for this slot" rather
// than on "does the typed field still hold its default".
//
// ## Which sub-stages are LIVE
// Landed ONE AT A TIME, each gated by the full-corpus A/B (exact byte equality
// on every covered line, both schemas) before the next is switched on.
const S3 = {
    int: true,   // S3a — INTEGER slots               -> i64    / Option<i64>
    str: true,   // S3b — STRING slots                -> String / Option<String>
    real: true,  // S3c — REAL slots (scalars only)   -> f64    / Option<f64>
    agg: true,   // S3d — numeric aggregates          -> Vec<f64> / Vec<[f64; N]> / …
};

// One aggregate level of a declaration: `LIST [1:?] OF `, `SET [1:3] OF `, …
const AGG_RE = /^(LIST|SET|ARRAY|BAG)\s*(?:\[\s*([^:\]]+?)\s*:\s*([^\]]+?)\s*\]\s*)?OF\s+/i;

/// Split a raw attribute declaration into its aggregate levels and the base
/// type name they wrap. `OPTIONAL` and the per-level `UNIQUE` are consumed.
///   "OPTIONAL LIST [1:?] OF LIST [3:3] OF IfcLengthMeasure"
///     -> { aggs: [LIST[1:?], LIST[3:3]], base: "IfcLengthMeasure" }
function parseShape(rawDecl) {
    let s = String(rawDecl || "").trim().replace(/^OPTIONAL\s+/i, "");
    const aggs = [];
    for (;;) {
        const m = AGG_RE.exec(s);
        if (!m) break;
        aggs.push({
            kind: m[1].toUpperCase(),
            lo: m[2] === undefined ? null : m[2],
            hi: m[3] === undefined ? null : m[3],
        });
        s = s.slice(m[0].length).replace(/^UNIQUE\s+/i, "");
    }
    let base = (s.split(/\s+/)[0] || "").replace(/;$/, "");
    const fb = base.indexOf("("); // STRING(22) -> STRING
    if (fb !== -1) base = base.substr(0, fb);
    return { aggs, base };
}

/// Follow the `TYPE X = Y;` alias chain to the base EXPRESS primitive.
///
/// The chains are MULTI-HOP: `IfcPositiveLengthMeasure` -> `IfcLengthMeasure`
/// -> `REAL`. Typing only the direct spellings would have left almost every
/// real-world slot untouched.
///
/// STOP conditions (the slot stays `IfcValue`), each for a concrete reason:
///   * ENUMERATION — already a generated Rust enum, handled upstream;
///   * SELECT      — the value can be any member type AND arrives LABELLED
///                   (`IFCLENGTHMEASURE(5.)`); one Rust primitive cannot hold it;
///   * NUMBER      — the supertype of INTEGER and REAL: a NUMBER slot may hold
///                   EITHER token kind, and re-emitting an INTEGER as `3000.`
///                   is a silent kind change, not a formatting difference;
///   * BINARY      — a bit string, not a number, despite `expTypeToTypeNum`;
///   * a defined type that is ITSELF an aggregate (`TYPE X = LIST [3:4] OF
///     INTEGER;`) — those serialise labelled in the contexts they appear in;
///   * anything unresolvable (an ENTITY reference, a missing declaration).
function resolveBase(name, typeMap) {
    let cur = name;
    const seen = new Set();
    for (let hops = 0; hops < 32; hops++) {
        if (cur === "REAL") return { k: "real" };
        if (cur === "INTEGER") return { k: "int" };
        if (cur === "STRING") return { k: "str" };
        if (cur === "NUMBER") return { k: "stop", why: "NUMBER" };
        if (cur === "BINARY") return { k: "stop", why: "BINARY" };
        if (cur === "BOOLEAN" || cur === "LOGICAL") return { k: "stop", why: "BOOLEAN/LOGICAL" };
        const t = typeMap.get(cur);
        if (!t) return { k: "stop", why: "entity-or-unresolved" };
        if (t.isEnum) return { k: "stop", why: "ENUMERATION" };
        if (t.isSelect) return { k: "stop", why: "SELECT" };
        if (t.isList) return { k: "stop", why: "aggregate-defined-type" };
        if (seen.has(cur)) return { k: "stop", why: "cyclic-alias" };
        seen.add(cur);
        cur = t.rawTypeName;
        if (!cur) return { k: "stop", why: "unresolved-alias" };
    }
    return { k: "stop", why: "alias-chain-too-deep" };
}

/// Final Rust representation for one non-derived attribute slot.
///   'enum'                     — a generated Rust enum (pre-S3, unchanged)
///   'int' | 'real' | 'str'     — scalar primitives
///   'vint' | 'vreal'           — single-level LIST/SET of INTEGER / REAL
///   'aint' | 'areal' (+ `n`)   — two-level LIST/SET whose INNER bound is EXACT
///   'value'                    — stays `IfcValue`, with `why` for the census
function classifySlot(prop, typeMap, enumNames) {
    if (enumNames.has(prop.type)) return { kind: "enum" };
    if (prop.multiline) return { kind: "value", why: "multiline-declaration" };
    const sh = parseShape(prop.rawDecl);
    const base = resolveBase(sh.base, typeMap);

    if (sh.aggs.length === 0) {
        if (base.k === "int") return S3.int ? { kind: "int" } : { kind: "value", why: "stage-off:int" };
        if (base.k === "real") return S3.real ? { kind: "real" } : { kind: "value", why: "stage-off:real" };
        if (base.k === "str") return S3.str ? { kind: "str" } : { kind: "value", why: "stage-off:str" };
        return { kind: "value", why: base.why };
    }
    if (base.k !== "int" && base.k !== "real") {
        return { kind: "value", why: "aggregate-of:" + (base.why || base.k) };
    }
    if (!S3.agg) return { kind: "value", why: "stage-off:aggregate" };

    // Only LIST and SET. ARRAY carries index semantics this representation does
    // not model, and BAG is unordered; both stay `IfcValue` rather than be
    // silently reshaped into a Vec. (2 ARRAY slots per schema.)
    const listy = (a) => a.kind === "LIST" || a.kind === "SET";
    if (sh.aggs.length === 1) {
        if (!listy(sh.aggs[0])) return { kind: "value", why: "aggregate-" + sh.aggs[0].kind };
        return { kind: base.k === "int" ? "vint" : "vreal" };
    }
    if (sh.aggs.length === 2) {
        if (!listy(sh.aggs[0]) || !listy(sh.aggs[1])) {
            return { kind: "value", why: "nested-" + sh.aggs[0].kind + "/" + sh.aggs[1].kind };
        }
        // The INNER bound must be EXACT, or `[T; N]` has no N. A `LIST [1:2]`
        // inner is NOT flattened and NOT padded — it stays `IfcValue`, because
        // either would change what the file said.
        const lo = Number(sh.aggs[1].lo), hi = Number(sh.aggs[1].hi);
        if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo !== hi || lo < 1) {
            return { kind: "value", why: "nested-inner-bound-not-exact" };
        }
        return { kind: base.k === "int" ? "aint" : "areal", n: lo };
    }
    return { kind: "value", why: "aggregate-depth-" + sh.aggs.length };
}

// ── Rust rendering of a typed slot ──────────────────────────────────────────
const TYPED_KINDS = new Set(["int", "real", "str", "vint", "vreal", "aint", "areal"]);
const AGG_KINDS = new Set(["vint", "vreal", "aint", "areal"]);

function rustBase(d) {
    switch (d.kind) {
        case "int": return "i64";
        case "real": return "f64";
        case "str": return "String";
        case "vint": return "Vec<i64>";
        case "vreal": return "Vec<f64>";
        case "aint": return `Vec<[i64; ${d.n}]>`;
        case "areal": return `Vec<[f64; ${d.n}]>`;
        default: return null;
    }
}
/// The SENTINEL a non-conforming token leaves in the typed field. Never
/// serialised — the residual entry pushed alongside it is consulted first by
/// every writer, so no code path can reach these values.
function rustSentinel(d) {
    switch (d.kind) {
        case "int": return "0";
        case "real": return "0.0";
        case "str": return "String::new()";
        default: return "Vec::new()";
    }
}
/// The single `IfcValue` variant a CONFORMING scalar token arrives as.
function scalarPat(d) {
    switch (d.kind) {
        case "int": return "IfcValue::Int(x)";
        case "real": return "IfcValue::Real(x)";
        case "str": return "IfcValue::Str(x)";
        default: return null;
    }
}
/// The whole-slot aggregate converter. Takes the parsed member vector BY VALUE
/// and hands it back untouched on ANY non-conforming member, so the residual
/// carries the ORIGINAL list rather than a rebuilt one.
function aggConv(d) {
    switch (d.kind) {
        case "vint": return "into_int_vec(items)";
        case "vreal": return "into_real_vec(items)";
        case "aint": return `into_int_arr_vec::<${d.n}>(items)`;
        case "areal": return `into_real_arr_vec::<${d.n}>(items)`;
        default: return null;
    }
}
/// APPEND the typed field's STEP token (the single-pass `write_step` road).
/// Every scalar goes through the crate's ONE writer for its kind, the same one
/// `write_ifc_value` calls, so the two roads cannot render a number differently.
function typedWrite(d, field, optional) {
    const one = {
        int: (x) => `push_i64(out, ${x})`,
        real: (x) => `push_real(out, ${x})`,
        str: (x) => `write_string(${x}, out)`,
        vint: (x) => `write_int_list(${x}, out)`,
        vreal: (x) => `write_real_list(${x}, out)`,
        aint: (x) => `write_int_arr_list::<${d.n}>(${x}, out)`,
        areal: (x) => `write_real_arr_list::<${d.n}>(${x}, out)`,
    }[d.kind];
    const byRef = d.kind === "str" || AGG_KINDS.has(d.kind);
    if (!optional) return one(byRef ? `&self.${field}` : `self.${field}`);
    return `match ${byRef ? "&" : ""}self.${field} { Some(x) => ${one("x")}, None => out.push('$') }`;
}
/// Count of non-finite members held by ONE real-typed field. `push_real` writes
/// `0.` for a non-finite REAL (STEP cannot express one), which is exactly what
/// the pre-S3 path did with the same value — so this is a CENSUS, not a defect
/// counter, and typing changes no bytes here.
function nonFiniteTerm(d, field, optional) {
    const inner = {
        real: "usize::from(!x.is_finite())",
        vreal: "x.iter().filter(|m| !m.is_finite()).count()",
        areal: "x.iter().flatten().filter(|m| !m.is_finite()).count()",
    }[d.kind];
    if (!inner) return null;
    if (optional) {
        const asRef = d.kind === "real" ? "" : ".as_ref()";
        return `self.${field}${asRef}.map_or(0, |x| ${inner})`;
    }
    return inner.replace(/\bx\b/g, `self.${field}`);
}

// ----------------------------------------------------------------------------
// Emit one schema module
// ----------------------------------------------------------------------------
function emitSchema(schemaName, entities, types) {
    const out = [];
    const p = (s) => out.push(s);

    const enumTypes = (types || []).filter((t) => t.isEnum && t.values && t.values.length);
    const enumNames = new Set(enumTypes.map((t) => t.name));

    // ── S3 PRE-PASS ─────────────────────────────────────────────────────────
    // Every slot is classified BEFORE a byte is emitted, for two reasons: the
    // `use super::{…}` list must name exactly the helpers this schema really
    // calls (an unused import is a warning, and this crate builds warning-free),
    // and the per-category census is a whole-schema fact reported by `main`.
    const typeMap = new Map((types || []).map((t) => [t.name, t]));
    const slotsOf = new Map();      // entity name -> slot descriptors
    const census = new Map();       // final category -> flattened slot count
    const stops = new Map();        // why a slot stayed IfcValue -> count
    const needs = new Set();        // generated/mod.rs helpers actually called
    const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

    for (const e of entities) {
        const used = new Set();
        const slots = e.derivedProps.map((prop, idx) => {
            const derived = e.ifcDerivedProps.includes(prop.name);
            if (derived) {
                bump(census, "derived*");
                return { prop, derived, field: null, d: { kind: "derived" }, idx };
            }
            const field = fieldIdent(prop.name, used);
            const d = classifySlot(prop, typeMap, enumNames);
            bump(census, d.kind);
            if (d.kind === "value" && d.why) bump(stops, d.why);
            if (TYPED_KINDS.has(d.kind)) {
                needs.add("residual_at");
                if (d.kind === "int") needs.add("push_i64");
                if (d.kind === "real") needs.add("push_real");
                if (d.kind === "str") needs.add("write_string");
                // S4: the `*_list_value` IfcValue-tree builders left with
                // `to_arguments`; only the READ converter and the single-pass
                // WRITER are imported now.
                if (d.kind === "vint") ["into_int_vec", "write_int_list"].forEach((n) => needs.add(n));
                if (d.kind === "vreal") ["into_real_vec", "write_real_list"].forEach((n) => needs.add(n));
                if (d.kind === "aint") ["into_int_arr_vec", "write_int_arr_list"].forEach((n) => needs.add(n));
                if (d.kind === "areal") ["into_real_arr_vec", "write_real_arr_list"].forEach((n) => needs.add(n));
            }
            return { prop, derived, field, d, idx };
        });
        slotsOf.set(e.name, slots);
    }

    p(`// AUTO-GENERATED by engine_web-ifc/src/schema-generator/rust/gen_rust_emitter.js`);
    p(`// Schema: ${schemaName}.  DO NOT EDIT — regenerate with:`);
    p(`//   node gen_rust_emitter.js <outDir> ${schemaName}`);
    p(`#![allow(non_snake_case, non_camel_case_types, dead_code, clippy::all)]`);
    // Only `Line` — S4 retired `to_arguments`, and nothing else in the emitted
    // module names an `IfcArgument` (`from_arguments` reads them through
    // `IfcValue::from_arg`). An unused import is a warning, and this crate
    // builds warning-free.
    p(`use crate::ffi::ffi::Line;`);
    // `write_ifc_value` / `write_line_head` are the S1 single-pass writers that
    // `write_step` is built from — hand-written in generated/mod.rs so there is
    // ONE copy of the scalar/token rendering rules, shared with step_text.
    //
    // S3 adds the typed-slot helpers to the same list: the per-kind scalar
    // writers (re-exported straight from `step_text`, NOT re-implemented), the
    // whole-slot aggregate converters, and `residual_at`. Only the ones this
    // schema actually calls are imported.
    {
        const imports = ["write_ifc_value", "write_line_head", "IfcValue", ...[...needs]];
        imports.sort((a, b) => a.localeCompare(b));
        p(`use super::{${imports.join(", ")}};`);
    }
    p(``);

    // ── ENUMERATIONS ────────────────────────────────────────────────────────
    // The schema declares a CLOSED value set for each of these; the emitter used
    // to keep them as `IfcValue::Enum(String)`, i.e. any string at all. As real
    // Rust enums an invalid literal is unrepresentable, which is what a
    // from-zero writer needs.
    //
    // `Other(String)` is deliberate: READING stays lenient, so a token this
    // schema version does not know is preserved verbatim and round-trips rather
    // than being dropped or rejected. Writing new data should never construct
    // it — it exists to carry foreign input through untouched.
    //
    // S2: this set now also carries the two SYNTHETIC enumerations `IfcBoolean`
    // (T/F) and `IfcLogical` (T/F/U) — see `injectSyntheticEnums`. They are
    // emitted by exactly the code below, with no special case, which is the
    // whole point: BOOLEAN and LOGICAL slots get the machinery that has already
    // been gated over the corpus rather than a parallel implementation.
    // (`enumTypes` / `enumNames` are computed by the S3 pre-pass above — the
    // classifier needs them before the first line is emitted.)
    for (const t of enumTypes) {
        const rn = rsIdent(t.name);
        // No `Eq`: `Other` carries an `IfcValue`, which holds f64.
        p(`#[derive(Clone, Debug, PartialEq)]`);
        p(`pub enum ${rn} {`);
        for (const v of t.values) p(`    ${v},`);
        p(`    /// A value that is NOT one of this schema's tokens, kept in its`);
        p(`    /// ORIGINAL form. It must carry the whole \`IfcValue\`, not just its`);
        p(`    /// text: real files put a quoted STRING (\`'.BEND.'\`) in slots the`);
        p(`    /// schema types as an enumeration, and re-emitting that as an enum`);
        p(`    /// token produced \`..BEND..\` — 650 corpus lines regressed on exactly`);
        p(`    /// that before this variant kept the kind as well as the text.`);
        p(`    Other(IfcValue),`);
        p(`}`);
        p(`impl ${rn} {`);
        p(`    pub fn from_literal(s: &str) -> Self {`);
        p(`        match s {`);
        for (const v of t.values) p(`            "${v}" => Self::${v},`);
        p(`            other => Self::Other(IfcValue::Enum(other.to_string())),`);
        p(`        }`);
        p(`    }`);
        p(`    pub fn as_literal(&self) -> &str {`);
        p(`        match self {`);
        for (const v of t.values) p(`            Self::${v} => "${v}",`);
        p(`            Self::Other(_) => "",`);
        p(`        }`);
        p(`    }`);
        p(`    /// APPEND this value's STEP token, for \`write_step\`. A known token`);
        p(`    /// becomes an enum literal \`.NAME.\`; a foreign value re-emits`);
        p(`    /// EXACTLY as it arrived, through the shared \`write_ifc_value\` (so`);
        p(`    /// the quoted STRING that real files put in enum slots stays a`);
        p(`    /// quoted string and never becomes \`..BEND..\`).`);
        p(`    pub fn write_value<F: Fn(u32) -> String>(&self, out: &mut String, resolve: &F) {`);
        p(`        match self {`);
        p(`            Self::Other(v) => write_ifc_value(v, out, resolve),`);
        p(`            known => {`);
        p(`                out.push('.');`);
        p(`                out.push_str(known.as_literal());`);
        p(`                out.push('.');`);
        p(`            }`);
        p(`        }`);
        p(`    }`);
        p(`    /// True when this value came from OUTSIDE the schema's value set.`);
        p(`    pub fn is_foreign(&self) -> bool { matches!(self, Self::Other(_)) }`);
        p(`}`);
        p(``);
    }

    const seenCodes = new Map(); // typeCode -> entityName (collision guard)
    const emitted = [];          // { name, code }
    // (entity, slot) rows for every SCALAR enum-typed attribute, accumulated
    // while `slots` is in scope (it is per-iteration) and emitted as the
    // ENUM_SLOTS table after the loop. The export writer uses this to fill an
    // empty enum slot with `.NOTDEFINED.` (or the enum's first literal when
    // the enum has no NOTDEFINED) instead of `$` — owner directive 2026-07-28.
    const enumValuesByName = new Map(enumTypes.map((t) => [t.name, t.values]));
    const enumSlotRows = [];

    for (const e of entities) {
        const code = crc32(e.name.toUpperCase());
        if (seenCodes.has(code)) {
            console.error(`  ! CRC collision: ${e.name} vs ${seenCodes.get(code)} (code ${code}) — skipping ${e.name}`);
            continue;
        }
        seenCodes.set(code, e.name);

        // Slot descriptors over the FULL inherited EXPRESS order — built (and
        // S3-classified) by the pre-pass at the top of this function.
        const slots = slotsOf.get(e.name);
        const fields = slots.filter((s) => !s.derived);
        const argCount = slots.length;
        const rname = rsIdent(e.name);
        // Slots that can produce a residual: exactly the S3-typed ones. An
        // `IfcValue` slot holds whatever arrived, so it never needs one.
        const typedSlots = fields.filter((s) => TYPED_KINDS.has(s.d.kind));
        const hasResidual = fields.length > 0;

        // struct
        // NO `Default`. Once a REQUIRED enum slot is a real Rust enum there is
        // no honest default for it — deriving one would have to invent a
        // schema value, and a from-zero writer silently defaulting an
        // attribute is exactly the failure this typing exists to prevent.
        // Entities are built from `from_arguments` or explicitly, field by field.
        p(`#[derive(Clone, Debug)]`);
        if (fields.length === 0) {
            p(`pub struct ${rname} {}`);
        } else {
            p(`pub struct ${rname} {`);
            for (const s of fields) {
                // OPTIONALITY FROM THE SCHEMA. `prop.optional` was already
                // computed (incl. the `SET [0:` inference) and then thrown
                // away — every slot was emitted as a bare `IfcValue`, so a
                // REQUIRED attribute could be silently omitted by anything
                // constructing an entity. `Option<T>` vs `T` moves that to
                // the type system, which is what a from-zero WRITER needs.
                const base = enumNames.has(s.prop.type)
                    ? rsIdent(s.prop.type)
                    : (rustBase(s.d) || 'IfcValue');
                const ty = s.prop.optional ? `Option<${base}>` : base;
                p(`    pub ${s.field}: ${ty},`);
            }
            // S3 residual side-channel. Present on every entity that has any
            // attribute at all — uniformly, so a caller never has to ask which
            // classes have it, and so the shape does not churn as later
            // sub-stages type more slots.
            p(`    /// Slots whose file value did NOT conform to the typed field's`);
            p(`    /// representation, as \`(slot index, ORIGINAL IfcValue)\`.`);
            p(`    ///`);
            p(`    /// Both writers consult this FIRST for every typed slot, so a`);
            p(`    /// non-conforming value re-emits through exactly the writers the`);
            p(`    /// pre-S3 code used and its bytes are unchanged BY CONSTRUCTION.`);
            p(`    /// The typed field is left at a sentinel (\`0\` / \`0.0\` /`);
            p(`    /// \`String::new()\` / \`Vec::new()\` / \`None\`) which is`);
            p(`    /// UNSERIALISABLE: no code path can reach it while the residual`);
            p(`    /// entry that put it there exists, and the two are written`);
            p(`    /// together or not at all.`);
            p(`    ///`);
            p(`    /// Empty on conforming data, where a \`Vec\` allocates nothing.`);
            p(`    pub residual: Vec<(u8, IfcValue)>,`);
            p(`}`);
        }
        // impl
        p(`impl ${rname} {`);
        p(`    pub const TYPE_CODE: u32 = ${code};`);
        p(`    pub const TYPE_NAME: &'static str = "${e.name}";`);
        p(`    pub const ARG_COUNT: usize = ${argCount};`);
        // from_arguments — port of generatePropAssignment (tolerant: count mismatch -> None)
        p(`    pub fn from_arguments(line: &Line) -> Option<Self> {`);
        p(`        let a = &line.arguments;`);
        p(`        if a.len() != ${argCount} { return None; }`);
        if (fields.length === 0) {
            p(`        Some(Self {})`);
        } else {
            if (typedSlots.length > 0) {
                // Field expressions are evaluated in written order and
                // `residual` is the LAST field, so every slot below can push
                // into it before it is moved into the struct.
                p(`        let mut residual: Vec<(u8, IfcValue)> = Vec::new();`);
            }
            p(`        Some(Self {`);
            slots.forEach((s, idx) => {
                if (s.derived) return;
                const isEnumSlot = enumNames.has(s.prop.type);
                const en = isEnumSlot ? rsIdent(s.prop.type) : null;
                const d = s.d;
                if (s.prop.optional && isEnumSlot) {
                    p(`            ${s.field}: match IfcValue::from_arg(&a[${idx}]) {`);
                    p(`                IfcValue::Null => None,`);
                    p(`                IfcValue::Enum(t) => Some(${en}::from_literal(&t)),`);
                    p(`                other => Some(${en}::Other(other)),`);
                    p(`            },`);
                } else if (isEnumSlot) {
                    p(`            ${s.field}: match IfcValue::from_arg(&a[${idx}]) {`);
                    p(`                IfcValue::Enum(t) => ${en}::from_literal(&t),`);
                    p(`                other => ${en}::Other(other),`);
                    p(`            },`);
                } else if (AGG_KINDS.has(d.kind)) {
                    // WHOLE-SLOT conformance. One member of the wrong kind (a
                    // bare INTEGER token among REALs) or one inner row of the
                    // wrong arity sends the ENTIRE slot to the residual — there
                    // is no member-wise coercion, because coercing one member
                    // would change that member's bytes.
                    const miss = s.prop.optional ? 'None' : 'Vec::new()';
                    p(`            ${s.field}: match IfcValue::from_arg(&a[${idx}]) {`);
                    if (s.prop.optional) p(`                IfcValue::Null => None,`);
                    p(`                IfcValue::List(items) => match ${aggConv(d)} {`);
                    p(`                    Ok(x) => ${s.prop.optional ? 'Some(x)' : 'x'},`);
                    p(`                    Err(items) => { residual.push((${idx}, IfcValue::List(items))); ${miss} }`);
                    p(`                },`);
                    p(`                other => { residual.push((${idx}, other)); ${miss} }`);
                    p(`            },`);
                } else if (TYPED_KINDS.has(d.kind)) {
                    const miss = s.prop.optional ? 'None' : rustSentinel(d);
                    p(`            ${s.field}: match IfcValue::from_arg(&a[${idx}]) {`);
                    if (s.prop.optional) p(`                IfcValue::Null => None,`);
                    p(`                ${scalarPat(d)} => ${s.prop.optional ? 'Some(x)' : 'x'},`);
                    p(`                other => { residual.push((${idx}, other)); ${miss} }`);
                    p(`            },`);
                } else if (s.prop.optional) {
                    // `$` -> None. Any other value -> Some. Reading stays
                    // TOLERANT: an unexpected value in an optional slot is
                    // kept, not rejected.
                    p(`            ${s.field}: match IfcValue::from_arg(&a[${idx}]) {`);
                    p(`                IfcValue::Null => None,`);
                    p(`                v => Some(v),`);
                    p(`            },`);
                } else {
                    p(`            ${s.field}: IfcValue::from_arg(&a[${idx}]),`);
                }
            });
            p(`            residual${typedSlots.length > 0 ? '' : ': Vec::new()'},`);
            p(`        })`);
        }
        p(`    }`);
        // ── S3 residual / typed-slot census ────────────────────────────────
        p(`    /// How many of this entity's TYPED slots fell back to the residual`);
        p(`    /// side-channel, i.e. held a value the schema's primitive cannot`);
        p(`    /// represent. Those slots re-emit their ORIGINAL bytes.`);
        p(`    pub fn residuals(&self) -> usize { ${hasResidual ? 'self.residual.len()' : '0'} }`);
        {
            // Only SCALAR real/int slots feed the two kind-confusion counters:
            // an aggregate residual carries the whole `IfcValue::List`, so
            // "an INTEGER token in a REAL slot" has no single value to report.
            const realIdx = typedSlots.filter((s) => s.d.kind === 'real').map((s) => s.idx);
            const intIdx = typedSlots.filter((s) => s.d.kind === 'int').map((s) => s.idx);
            const nfTerms = typedSlots
                .map((s) => nonFiniteTerm(s.d, s.field, s.prop.optional))
                .filter((t) => t !== null);
            const nf = nfTerms.length ? nfTerms.join(' + ') : '0';
            p(`    /// \`(residuals, int_token_in_real_slot, real_token_in_integer_slot,`);
            p(`    /// non_finite_reals)\` — the S3 census, generated per entity so the`);
            p(`    /// totals are exact rather than sampled.`);
            p(`    ///`);
            p(`    /// The two middle counters are the ones a silent coercion would have`);
            p(`    /// hidden: an INTEGER token re-emitted into a REAL slot would print`);
            p(`    /// \`3000.\` where the file said \`3000\`. Neither is an error — both`);
            p(`    /// ride the residual and re-emit verbatim — but both are facts the`);
            p(`    /// corpus, not the schema, has to answer.`);
            p(`    ///`);
            p(`    /// \`non_finite_reals\` counts REALs that are not finite. STEP cannot`);
            p(`    /// express one and \`push_real\` writes \`0.\` for them, exactly as the`);
            p(`    /// pre-S3 path did — so this is a census, not a byte difference.`);
            p(`    pub fn typed_stats(&self) -> (usize, usize, usize, usize) {`);
            if (!hasResidual || (realIdx.length === 0 && intIdx.length === 0)) {
                p(`        (${hasResidual ? 'self.residual.len()' : '0'}, 0, 0, ${nf})`);
            } else {
                // Declare a counter ONLY when this entity has a slot that can
                // move it — an always-zero `let mut` is an `unused_mut`, and
                // this crate builds warning-free.
                if (realIdx.length) p(`        let mut int_in_real = 0usize;`);
                if (intIdx.length) p(`        let mut real_in_int = 0usize;`);
                p(`        for (slot, v) in &self.residual {`);
                p(`            match (*slot, v) {`);
                if (realIdx.length) p(`                (${realIdx.join(' | ')}, IfcValue::Int(_)) => int_in_real += 1,`);
                if (intIdx.length) p(`                (${intIdx.join(' | ')}, IfcValue::Real(_)) => real_in_int += 1,`);
                p(`                _ => {}`);
                p(`            }`);
                p(`        }`);
                p(`        (self.residual.len(), ${realIdx.length ? 'int_in_real' : '0'}, ${intIdx.length ? 'real_in_int' : '0'}, ${nf})`);
            }
            p(`    }`);
        }
        // How many of THIS entity's enum slots hold a value outside the
        // schema's set. Generated rather than reflected so the count is exact:
        // it is the only way to find out whether the `Other` catch-all is
        // load-bearing on real data or merely defensive.
        {
            const es = fields.filter((s) => enumNames.has(s.prop.type));
            p(`    pub fn foreign_enums(&self) -> usize {`);
            if (es.length === 0) {
                p(`        0`);
            } else {
                const terms = es.map((s) =>
                    s.prop.optional
                        ? `self.${s.field}.as_ref().map_or(0, |e| e.is_foreign() as usize)`
                        : `self.${s.field}.is_foreign() as usize`);
                p(`        ${terms.join(' + ')}`);
            }
            p(`    }`);
        }
        // S2 counters. The two SYNTHETIC enums are the only ones whose value set
        // this generator invents rather than reads, so "does real data actually
        // fit it" is a question only measurement answers. Generated per entity
        // (like `foreign_enums`) so the totals are exact rather than sampled.
        {
            const bs = fields.filter((s) => s.prop.type === 'IfcBoolean');
            const ls = fields.filter((s) => s.prop.type === 'IfcLogical');
            // `test` renders the predicate over one expression: the field's own
            // place for a REQUIRED slot, the `map_or` binding (a `&Enum`) for an
            // OPTIONAL one, where an absent value counts as 0. Neither form
            // moves — `matches!` binds nothing, `is_foreign` takes `&self`.
            const term = (s, test) =>
                s.prop.optional
                    ? `self.${s.field}.as_ref().map_or(0, |e| ${test('e')} as usize)`
                    : `${test(`self.${s.field}`)} as usize`;
            const sum = (list, test) =>
                list.length === 0 ? '0' : list.map((s) => term(s, test)).join(' + ');
            const IS_U = (x) => `matches!(${x}, IfcLogical::U)`;
            const IS_FOREIGN = (x) => `${x}.is_foreign()`;
            p(`    /// \`(logical_unknown, boolean_foreign, logical_foreign)\` over this`);
            p(`    /// entity's BOOLEAN / LOGICAL slots:`);
            p(`    ///   * \`logical_unknown\`  — LOGICAL slots holding a first-class \`.U.\`;`);
            p(`    ///   * \`boolean_foreign\`  — BOOLEAN slots holding anything that is not`);
            p(`    ///     \`.T.\`/\`.F.\` (a schema-illegal \`.U.\`, quoted dirt, \`$\`, \`*\`, …);`);
            p(`    ///   * \`logical_foreign\`  — LOGICAL slots holding a non-T/F/U token.`);
            p(`    /// A "foreign" hit is preserved verbatim, never an error.`);
            p(`    pub fn synthetic_enum_stats(&self) -> (usize, usize, usize) {`);
            p(`        (`);
            p(`            ${sum(ls, IS_U)},`);
            p(`            ${sum(bs, IS_FOREIGN)},`);
            p(`            ${sum(ls, IS_FOREIGN)},`);
            p(`        )`);
            p(`    }`);
        }
        // write_step (S1, and since S4 the only writer) — one slot walk, the
        // derived-slot `*` and `None` -> `$` rules, and the finished
        // `#id=KEYWORD(...);` appended straight into the caller's buffer with no
        // IfcArgument tree in between. Byte-for-byte equality with the retired
        // two-pass path was gated over the whole corpus before that path was
        // removed; the engine-level gate is gvcs-ifc/tests/emitter_golden.rs.
        //
        // The keyword is upper-cased HERE, at generation time: `TYPE_NAME` keeps
        // the EXPRESS spelling (`IfcWall`), and `line_to_step` upper-cases
        // `line.type_name` per line — this path bakes the constant instead.
        {
            const kw = e.name.toUpperCase();
            // A zero-field entity uses neither the resolver nor any slot writer
            // (its argument list is empty or wholly derived), so name the
            // parameter `_resolve` there rather than warn. The SIGNATURE is
            // unchanged — parameter names are not part of it.
            const rp = fields.length === 0 ? '_resolve' : 'resolve';
            p(`    /// Append this entity as one STEP line, \`#<id>=${kw}(...);\``);
            p(`    /// (no trailing newline), in a SINGLE pass — no token tree, no`);
            p(`    /// intermediate \`String\`. Byte-identical to what`);
            p(`    /// \`step_text::line_to_step\` writes for the same entity.`);
            p(`    pub fn write_step<F: Fn(u32) -> String>(&self, express_id: u32, out: &mut String, ${rp}: &F) {`);
            p(`        write_line_head(out, express_id, "${kw}");`);
            slots.forEach((s, idx) => {
                if (idx > 0) p(`        out.push(',');`);
                if (s.derived) p(`        out.push('*');`);
                else if (enumNames.has(s.prop.type) && s.prop.optional) {
                    p(`        match &self.${s.field} {`);
                    p(`            Some(e) => e.write_value(out, resolve),`);
                    p(`            None => out.push('$'),`);
                    p(`        }`);
                } else if (enumNames.has(s.prop.type))
                    p(`        self.${s.field}.write_value(out, resolve);`);
                else if (TYPED_KINDS.has(s.d.kind)) {
                    // RESIDUAL FIRST — a slot the read side could not fit into
                    // the typed field re-emits its ORIGINAL value through the
                    // very writer the pre-S3 code used. The typed arm renders
                    // through the crate's ONE writer for that kind, so a typed
                    // field and a residual cannot format a number differently.
                    p(`        match residual_at(&self.residual, ${idx}) {`);
                    p(`            Some(rv) => write_ifc_value(rv, out, resolve),`);
                    p(`            None => ${typedWrite(s.d, s.field, s.prop.optional)},`);
                    p(`        }`);
                }
                else if (s.prop.optional)
                    // An absent OPTIONAL is `IfcValue::Null`, i.e. `$`.
                    p(`        write_ifc_value(self.${s.field}.as_ref().unwrap_or(&IfcValue::Null), out, resolve);`);
                else p(`        write_ifc_value(&self.${s.field}, out, resolve);`);
            });
            p(`        out.push_str(");");`);
            p(`    }`);
        }
        p(`}`);
        p(``);

        emitted.push({ name: rname, code, origName: e.name, argCount });
        slots.forEach((s, idx) => {
            if (s.derived || s.prop.set) return;
            if (!enumNames.has(s.prop.type)) return;
            // S2: the two SYNTHETIC enums are NEVER fill-table rows. `ENUM_SLOTS`
            // feeds the export writer's empty-slot fill, which writes
            // `.NOTDEFINED.` or — when the enum has no NOTDEFINED, which neither
            // of these does — its FIRST literal. For `IfcBoolean` that first
            // literal is `T`: listing these here would let an omitted boolean
            // attribute be exported as `.T.`, i.e. the writer inventing a TRUE
            // nobody stored. A boolean slot with nothing behind it must stay `$`.
            if (SYNTH_ENUM_NAMES.has(s.prop.type)) return;
            enumSlotRows.push({
                entity: e.name.toUpperCase(),
                idx,
                propName: s.prop.name,
                enumType: s.prop.type,
                optional: s.prop.optional,
            });
        });
    }

    // AnyEntity wrapper enum + dispatch
    p(`/// Wrapper over every generated entity of schema ${schemaName}.`);
    p(`#[derive(Clone, Debug)]`);
    p(`pub enum AnyEntity {`);
    for (const en of emitted) p(`    ${en.name}(${en.name}),`);
    p(`}`);
    p(`impl AnyEntity {`);
    p(`    /// Append this entity as one STEP line — the single-pass writer.`);
    p(`    /// Dispatches to the per-entity \`write_step\`.`);
    p(`    pub fn write_step<F: Fn(u32) -> String>(&self, express_id: u32, out: &mut String, resolve: &F) {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(e) => e.write_step(express_id, out, resolve),`);
    p(`        }`);
    p(`    }`);
    p(`    /// Enum slots holding a value outside this schema's value set.`);
    p(`    pub fn foreign_enums(&self) -> usize {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(e) => e.foreign_enums(),`);
    p(`        }`);
    p(`    }`);
    p(`    /// \`(logical_unknown, boolean_foreign, logical_foreign)\` — see the`);
    p(`    /// per-entity \`synthetic_enum_stats\`.`);
    p(`    pub fn synthetic_enum_stats(&self) -> (usize, usize, usize) {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(e) => e.synthetic_enum_stats(),`);
    p(`        }`);
    p(`    }`);
    p(`    /// Typed slots that fell back to the residual side-channel.`);
    p(`    pub fn residuals(&self) -> usize {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(e) => e.residuals(),`);
    p(`        }`);
    p(`    }`);
    p(`    /// \`(residuals, int_token_in_real_slot, real_token_in_integer_slot,`);
    p(`    /// non_finite_reals)\` — see the per-entity \`typed_stats\`.`);
    p(`    pub fn typed_stats(&self) -> (usize, usize, usize, usize) {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(e) => e.typed_stats(),`);
    p(`        }`);
    p(`    }`);
    p(`    pub fn type_code(&self) -> u32 {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(_) => ${en.code},`);
    p(`        }`);
    p(`    }`);
    p(`    pub fn type_name(&self) -> &'static str {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(_) => "${en.origName}",`);
    p(`        }`);
    p(`    }`);
    p(`}`);
    p(``);
    // from_line dispatch — keyed on the engine type_code (== crc32(NAME))
    p(`/// Dispatch a parsed engine [`+"`Line`"+`] to its generated entity by type_code.`);
    p(`pub fn from_line(line: &Line) -> Option<AnyEntity> {`);
    p(`    match line.type_code {`);
    for (const en of emitted) p(`        ${en.code} => ${en.name}::from_arguments(line).map(AnyEntity::${en.name}),`);
    p(`        _ => None,`);
    p(`    }`);
    p(`}`);
    p(``);
    // type_name_of table
    p(`/// type_code -> entity name (generated entities only).`);
    p(`pub fn type_name_of(type_code: u32) -> Option<&'static str> {`);
    p(`    match type_code {`);
    for (const en of emitted) p(`        ${en.code} => Some("${en.origName}"),`);
    p(`        _ => None,`);
    p(`    }`);
    p(`}`);
    p(``);
    // arity_of table — the flattened (inherited + own) attribute count per
    // entity, i.e. exactly the N that from_arguments gates on. The EXPORT
    // writer pads a class line to this arity instead of hand-maintaining 776
    // entity shapes; a wrong count here would already have broken import.
    p(`/// type_code -> flattened attribute count (generated entities only).`);
    p(`pub fn arity_of(type_code: u32) -> Option<usize> {`);
    p(`    match type_code {`);
    for (const en of emitted) p(`        ${en.code} => Some(${en.argCount}),`);
    p(`        _ => None,`);
    p(`    }`);
    p(`}`);
    p(``);
    // (entity, parent) pairs — the raw SUBTYPE OF chains from the .exp. The
    // cross-version mapping (IFC2X3 class -> nearest ancestor that still
    // exists in IFC4) is DERIVED from these two tables at runtime and pinned
    // by a diffable golden, never hand-maintained (owner requirement).
    p(`/// (entity name, parent name) — the .exp SUBTYPE OF chain. Root
/// entities are omitted.`);
    p(`pub static ENTITY_PARENTS: &[(&str, &str)] = &[`);
    for (const e of entities) {
        if (e.parent) p(`    ("${e.name}", "${e.parent}"),`);
    }
    p(`];`);
    p(``);
    // Every generated type code, so a consumer can BUILD reverse lookups
    // (name -> code, code -> arity) without linking the C++ engine. The
    // export writer is the consumer: it must resolve a stored class name to
    // (type_code, arity) with no model open.
    p(`/// Every generated entity type code, in emission order.`);
    p(`pub static ENTITY_CODES: &[u32] = &[`);
    for (const en of emitted) p(`    ${en.code},`);
    p(`];`);
    p(``);
    p(`/// Number of generated entity classes for this schema.`);
    p(`pub const ENTITY_COUNT: usize = ${emitted.length};`);
    p(``);
    // Enum literal sets, one row per ENUMERATION type, literal order as
    // declared in the .exp. The writer resolves a STORED enum string against
    // this (strict-on-write: only schema literals are emitted) and picks the
    // fill for an empty slot: NOTDEFINED when the enum has it, else the
    // first literal.
    p(`/// (enum type name, its literals in .exp declaration order).`);
    p(`///`);
    p(`/// The SYNTHETIC \`IfcBoolean\` / \`IfcLogical\` enums are DELIBERATELY absent:`);
    p(`/// this table is the export writer's fill source (joined with \`ENUM_SLOTS\`),`);
    p(`/// and its rule for an empty slot is \`.NOTDEFINED.\` or else the enum's FIRST`);
    p(`/// literal. Neither synthetic enum has \`NOTDEFINED\`, so the fill would reach`);
    p(`/// for \`T\` and export a \`.T.\` that nothing in the model ever stored. An empty`);
    p(`/// BOOLEAN slot stays \`$\`. Their literals are not schema data anyway — this`);
    p(`/// generator invents them from \`BOOLEAN\`/\`LOGICAL\`, so publishing them here`);
    p(`/// as ".exp declaration order" would be a lie as well as a hazard.`);
    p(`pub static ENUM_VALUES: &[(&str, &[&str])] = &[`);
    for (const t of enumTypes) {
        if (t.synthetic) continue;
        p(`    ("${t.name}", &[${t.values.map((v) => `"${v}"`).join(", ")}]),`);
    }
    p(`];`);
    p(``);
    // Scalar enum-typed attribute slots over the FULL inherited argument
    // order — the writer's answer to "which '$' paddings are really enum
    // slots". SET/LIST-of-enum and DERIVE slots are excluded (a list slot
    // has no single default; a derived slot serialises as '*').
    p(`/// (ENTITY NAME UPPERCASE, zero-based STEP slot, attribute name,`);
    p(`/// enum type name, attribute is OPTIONAL).`);
    p(`///`);
    p(`/// BOOLEAN / LOGICAL slots are DELIBERATELY absent — see \`ENUM_VALUES\`.`);
    p(`/// They are real generated enums (\`IfcBoolean\` / \`IfcLogical\`) on the struct,`);
    p(`/// but they are not fill-table rows: the fill must never be able to invent a`);
    p(`/// \`.T.\` for a boolean attribute the model left empty.`);
    p(`pub static ENUM_SLOTS: &[(&str, u16, &str, &str, bool)] = &[`);
    for (const r of enumSlotRows) {
        p(`    ("${r.entity}", ${r.idx}, "${r.propName}", "${r.enumType}", ${r.optional}),`);
    }
    p(`];`);
    p(``);

    return { text: out.join("\n") + "\n", count: emitted.length, census, stops };
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
function main() {
    const argv = process.argv.slice(2);
    if (argv.length < 1) {
        console.error("usage: node gen_rust_emitter.js <outDir> [SCHEMA ...]");
        process.exit(2);
    }
    const outDir = argv[0];
    const schemas = argv.length > 1 ? argv.slice(1) : ["IFC4"];
    fs.mkdirSync(outDir, { recursive: true });

    for (const schema of schemas) {
        const expPath = path.join(__dirname, `${schema}.exp`);
        if (!fs.existsSync(expPath)) {
            console.error(`! missing ${expPath}`);
            process.exit(2);
        }
        console.log(`Generating ${schema} from ${expPath} ...`);
        const data = fs.readFileSync(expPath, "utf8");
        const parsed = parseElements(data);
        let entities = sortEntities(parsed.entities);
        entities.forEach((e) => walkParents(e, entities));
        entities = findSubClasses(entities);

        // S2: BOOLEAN / LOGICAL attribute slots become the two synthetic enums.
        // AFTER walkParents (derivedProps must exist), BEFORE codegen.
        const census = injectSyntheticEnums(entities, parsed.types);
        if (census.size) {
            const rows = [...census.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            const parts = rows.map(
                ([spelling, c]) =>
                    `${spelling} -> ${SYNTH_ENUM_BY_SPELLING.get(spelling)}: ` +
                    `${c.declared} declared / ${c.flattened} flattened`);
            console.log(`  BOOLEAN/LOGICAL slots: ${parts.join("; ")}`);
        }

        const { text, count, census: s3, stops } = emitSchema(schema, entities, parsed.types);
        const outFile = path.join(outDir, `${schema.toLowerCase().replace(/\./g, "_")}.rs`);
        fs.writeFileSync(outFile, text, "utf8");
        const loc = text.split("\n").length;
        console.log(`  -> ${outFile}  (${count} entities, ${loc} LOC)`);

        // S3 census: FLATTENED slots per final Rust representation. Printed at
        // GENERATION time because it is a property of the schema, not of any
        // file — the corpus gate answers the different question of what real
        // data puts in those slots.
        const order = ["int", "real", "str", "vint", "vreal", "aint", "areal", "enum", "value", "derived*"];
        const keys = [...s3.keys()].sort((a, b) => {
            const ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        const total = [...s3.values()].reduce((a, b) => a + b, 0);
        console.log(`  S3 slot census (${total} flattened slots, stages ` +
            `int=${S3.int} str=${S3.str} real=${S3.real} agg=${S3.agg}):`);
        for (const k of keys) console.log(`      ${String(k).padEnd(10)} ${String(s3.get(k)).padStart(6)}`);
        const stopRows = [...stops.entries()].sort((a, b) => b[1] - a[1]);
        console.log(`  S3 'value' reasons: ` +
            stopRows.map(([k, v]) => `${k}=${v}`).join(", "));
    }
    console.log("Done.");
}
main();
