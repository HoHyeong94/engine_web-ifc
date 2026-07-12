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
//   * `pub struct <Name>` with owned `IfcValue` fields in full inherited
//     EXPRESS order (inverse attrs skipped; SELF\ DERIVE slots are NOT fields
//     but serialize as `*` at their positions),
//   * `#[derive(Default)]`,
//   * `fn to_arguments(&self) -> Vec<IfcArgument>`  (port of generateTapeAssignment),
//   * `fn from_arguments(line: &Line) -> Option<Self>` (port of generatePropAssignment),
//   * type-code CRC assoc consts,
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
            const typeNum = expTypeToTypeNum(typeName);
            typeName = expTypeToTSType(typeName);
            type = { name, typeName, typeNum, isList, isEnum, isSelect, values };
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
            entity.props.push({ name, type: tsType, typeNum: expTypeToTypeNum(t), primitive: tsType !== t, optional, set, dimensions });
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
// Emit one schema module
// ----------------------------------------------------------------------------
function emitSchema(schemaName, entities) {
    const out = [];
    const p = (s) => out.push(s);

    p(`// AUTO-GENERATED by engine_web-ifc/src/schema-generator/rust/gen_rust_emitter.js`);
    p(`// Schema: ${schemaName}.  DO NOT EDIT — regenerate with:`);
    p(`//   node gen_rust_emitter.js <outDir> ${schemaName}`);
    p(`#![allow(non_snake_case, non_camel_case_types, dead_code, clippy::all)]`);
    p(`use crate::ffi::ffi::{IfcArgument, Line};`);
    p(`use super::IfcValue;`);
    p(``);

    const seenCodes = new Map(); // typeCode -> entityName (collision guard)
    const emitted = [];          // { name, code }

    for (const e of entities) {
        const code = crc32(e.name.toUpperCase());
        if (seenCodes.has(code)) {
            console.error(`  ! CRC collision: ${e.name} vs ${seenCodes.get(code)} (code ${code}) — skipping ${e.name}`);
            continue;
        }
        seenCodes.set(code, e.name);

        // Build slot descriptors over the FULL inherited EXPRESS order.
        const used = new Set();
        const slots = e.derivedProps.map((prop) => {
            const derived = e.ifcDerivedProps.includes(prop.name);
            return { prop, derived, field: derived ? null : fieldIdent(prop.name, used) };
        });
        const fields = slots.filter((s) => !s.derived);
        const argCount = slots.length;
        const rname = rsIdent(e.name);

        // struct
        p(`#[derive(Clone, Debug, Default)]`);
        if (fields.length === 0) {
            p(`pub struct ${rname} {}`);
        } else {
            p(`pub struct ${rname} {`);
            for (const s of fields) p(`    pub ${s.field}: IfcValue,`);
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
            p(`        Some(Self {`);
            slots.forEach((s, idx) => {
                if (!s.derived) p(`            ${s.field}: IfcValue::from_arg(&a[${idx}]),`);
            });
            p(`        })`);
        }
        p(`    }`);
        // to_arguments — port of generateTapeAssignment (DERIVE slot -> `*`)
        p(`    pub fn to_arguments(&self) -> Vec<IfcArgument> {`);
        p(`        let mut v: Vec<IfcArgument> = Vec::with_capacity(${argCount});`);
        for (const s of slots) {
            if (s.derived) p(`        v.push(IfcValue::star_arg());`);
            else p(`        v.push(self.${s.field}.to_arg());`);
        }
        p(`        v`);
        p(`    }`);
        p(`}`);
        p(``);

        emitted.push({ name: rname, code, origName: e.name });
    }

    // AnyEntity wrapper enum + dispatch
    p(`/// Wrapper over every generated entity of schema ${schemaName}.`);
    p(`#[derive(Clone, Debug)]`);
    p(`pub enum AnyEntity {`);
    for (const en of emitted) p(`    ${en.name}(${en.name}),`);
    p(`}`);
    p(`impl AnyEntity {`);
    p(`    pub fn to_arguments(&self) -> Vec<IfcArgument> {`);
    p(`        match self {`);
    for (const en of emitted) p(`            AnyEntity::${en.name}(e) => e.to_arguments(),`);
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
    p(`/// Number of generated entity classes for this schema.`);
    p(`pub const ENTITY_COUNT: usize = ${emitted.length};`);
    p(``);

    return { text: out.join("\n") + "\n", count: emitted.length };
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

        const { text, count } = emitSchema(schema, entities);
        const outFile = path.join(outDir, `${schema.toLowerCase().replace(/\./g, "_")}.rs`);
        fs.writeFileSync(outFile, text, "utf8");
        const loc = text.split("\n").length;
        console.log(`  -> ${outFile}  (${count} entities, ${loc} LOC)`);
    }
    console.log("Done.");
}
main();
