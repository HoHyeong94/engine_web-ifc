/* eslint-disable @typescript-eslint/no-explicit-any */
import { Entity, Type as TypeDef } from "./gen_functional_types_interfaces";

// Rust 식별자 안전하게 만들기 (예약어/기호 등)
export function rsIdent(s: string) {
    const reserved = new Set([
        "as", "break", "const", "continue", "crate", "else", "enum", "extern", "false",
        "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut",
        "pub", "ref", "return", "self", "Self", "static", "struct", "super", "trait",
        "true", "type", "unsafe", "use", "where", "while", "dyn", "async", "await", "try"
    ]);
    const safe = s.replace(/[^A-Za-z0-9_]/g, "_");
    return reserved.has(safe) ? `${safe}_` : safe;
}

export function rsTypeNameOfPrimitive(t: string): string {
    switch (t) {
        case "number": return "f64";
        case "boolean": return "bool";
        case "string": return "String";
        case "logical": return "u8"; // FALSE=0, TRUE=1, UNKNOWN=2 (TS enum 호환)
        default: return t; // Ifc 타입명은 후처리에서 다시 매핑
    }
}

export function rsTypeRef(typeName: string, types: TypeDef[]): string {
    // Ifc타입이 실제 primitive/래퍼로 정의되어 있으면 그쪽으로 매핑
    const found = types.find(x => x.name === typeName);
    if (!found) return rsIdent(typeName);
    if (found.isList) return rsIdent(found.name);
    if (found.isSelect) return rsIdent(found.name);
    if (found.isEnum) return rsIdent(found.name);
    // alias/래퍼
    let tn = found.typeName;
    if (tn.includes("Ifc")) {
        const raw = types.find(x => x.name === tn);
        if (raw) tn = raw.typeName;
    }
    return rsTypeNameOfPrimitive(tn);
}

export function emitRustPrelude(rs: string[]) {
    rs.push("//! This file is auto-generated. See src/schema-generator/gen_functional_types.ts");
    rs.push("#![allow(non_camel_case_types)]");
    rs.push("#![allow(non_snake_case)]");
    rs.push("#![allow(dead_code)]");
    rs.push("");
    rs.push("use std::collections::HashMap;");
    rs.push("use once_cell::sync::Lazy;");
    rs.push("use std::any::Any;");
    rs.push("");
    rs.push("/// Primitive/aggregate value used by runtime tables");
    rs.push("#[derive(Clone, Debug)]");
    rs.push("pub enum Value {");
    rs.push("    I32(i32), U32(u32), F64(f64), Bool(bool), Str(String),");
    rs.push("    List(Vec<Value>), Logical(u8), Null,");
    rs.push("}");
    rs.push("");
    rs.push("#[derive(Clone, Debug)]");
    rs.push("pub struct InverseDef { pub name: &'static str, pub target_type: u32, pub pos: usize, pub is_set: bool }");
    rs.push("");
    rs.push("pub type AnyBox = Box<dyn Any + Send + Sync>;");
    rs.push("");
    rs.push("pub type FromRawFn = fn(Vec<Value>) -> AnyBox;");
    rs.push("pub type ToRawFn   = fn(&dyn Any) -> Vec<Value>;");
    rs.push("pub type InitFn    = fn(Value) -> Value;");
    rs.push("");
    rs.push("pub static SCHEMA_NAMES: Lazy<Vec<Vec<&'static str>>> = Lazy::new(|| vec![]); // filled below");
    rs.push("");
}

export function openRootModule(rs: string[]) {
    rs.push("pub mod ifc_schema {");
}

export function closeRootModule(rs: string[]) {
    rs.push("} // mod ifc_schema");
}

export function emitSchemasEnum(rs: string[], schemaNames: string[]) {
    rs.push("    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]");
    rs.push("    pub enum Schemas {");
    schemaNames.forEach(n => rs.push(`        ${n.replace(/\./g, "_")},`));
    rs.push("    }");
    rs.push("");
}

export function emitSchemaNames(rs: string[], schemaNameClean: string, aliases: string[]) {
    // 러스트에서는 정적 Vec을 모듈 단위로 노출
    const arr = [schemaNameClean, ...aliases].map(a => `"${a}"`).join(", ");
    rs.push(`    pub static SCHEMA_NAMES_${schemaNameClean}: Lazy<Vec<&'static str>> = Lazy::new(|| vec![${arr}]);`);
}

export function emitTypes(rs: string[], schemaName: string, types: TypeDef[]) {
    rs.push(`    // ===== Types for schema ${schemaName} =====`);
    for (const t of types) {
        const name = rsIdent(t.name);
        if (t.isList) {
            const inner = rsTypeRef(t.typeName, types);
            rs.push(`    #[derive(Clone, Debug)]`);
            rs.push(`    pub struct ${name}(pub Vec<${inner}>);`);
        } else if (t.isSelect) {
            rs.push(`    #[derive(Clone, Debug)]`);
            rs.push(`    pub enum ${name} {`);
            for (const v of t.values) {
                const isType = !!types.find(x => x.name === v);
                // Ifc 엔티티면 핸들이나 Box로 할 수도 있으나, 여기선 간단히 독립 variant
                rs.push(`        ${rsIdent(v)}(${isType ? rsIdent(v) : rsIdent(v)}),`);
            }
            rs.push("    }");
        } else if (t.isEnum) {
            rs.push(`    #[derive(Clone, Debug)]`);
            rs.push(`    pub enum ${name} {`);
            for (const v of t.values) rs.push(`        ${rsIdent(v)},`);
            rs.push("    }");
        } else {
            // alias/원시래퍼
            let tn = t.typeName;
            if (tn.includes("Ifc")) {
                const raw = types.find(x => x.name === tn);
                if (raw) tn = raw.typeName;
            }
            const base = rsTypeNameOfPrimitive(tn);
            rs.push(`    #[derive(Clone, Debug)]`);
            rs.push(`    pub struct ${name}(pub ${base});`);
        }
    }
    rs.push("");
}

export function emitEntityStructs(rs: string[], schemaName: string, entities: Entity[], types: TypeDef[]) {
    rs.push(`    // ===== Entities for schema ${schemaName} =====`);
    for (const e of entities) {
        rs.push(`    #[derive(Clone, Debug)]`);
        rs.push(`    pub struct ${rsIdent(e.name)} {`);
        for (const p of e.derivedProps) {
            const rustT = rsIdent(p.type.includes("Ifc") ? p.type : rsTypeRef(p.type, types));
            rs.push(`        pub ${rsIdent(p.name)}: Option<${rustT}>,`);
        }
        rs.push("    }");
        rs.push("");
    }
}

export function emitConsts(rs: string[], allNamesUpper: string[], crc: (s: string) => number) {
    rs.push("    // ===== CRC32 codes (entities + types + file meta) =====");
    for (const u of allNamesUpper) {
        rs.push(`    pub const ${u}: u32 = ${crc(u)};`);
    }
    rs.push("");
}

export function emitInheritance(rs: string[], schemaName: string, entities: Entity[], crc: (s: string) => number) {
    rs.push(`    pub static INHERITANCE_DEF_${schemaName}: Lazy<HashMap<u32, Vec<u32>>> = Lazy::new(|| {`);
    rs.push("        let mut m = HashMap::new();");
    for (const e of entities) {
        if (e.children.length > 0) {
            const key = crc(e.name.toUpperCase());
            const vals = e.children.map(c => crc(c.toUpperCase())).join(", ");
            rs.push(`        m.insert(${key}, vec![${vals}]);`);
        }
    }
    rs.push("        m");
    rs.push("    });");
    rs.push("");
}

export function emitInverse(rs: string[], schemaName: string, entities: Entity[], crc: (s: string) => number) {
    rs.push(`    pub static INVERSE_PROPERTY_DEF_${schemaName}: Lazy<HashMap<u32, Vec<InverseDef>>> = Lazy::new(|| {`);
    rs.push("        let mut m = HashMap::new();");
    for (const e of entities) {
        if (e.derivedInverseProps.length > 0) {
            const key = crc(e.name.toUpperCase());
            rs.push(`        m.insert(${key}, vec![`);
            for (const prop of e.derivedInverseProps) {
                // target pos 계산은 호출 측에서 해도 되지만 TS와 동일하게 생성 시 계산
                rs.push(`            InverseDef { name: "${prop.name}", target_type: ${crc(prop.type.toUpperCase())}, pos: 0, is_set: ${prop.set ? "true" : "false"} },`);
            }
            rs.push("        ]);");
        }
    }
    rs.push("        m");
    rs.push("    });");
    rs.push("");
}

function fieldGetterExpr(j: number): string {
    // v.get(j) 를 그대로 Value로 받음 (실사용처에서 적절히 초기화)
    return `v.get(${j}).cloned().unwrap_or(Value::Null)`;
}

// 생성자 매핑 (Vec<Value> -> struct)
export function emitFromRaw(rs: string[], schemaName: string, entities: Entity[], crc: (s: string) => number) {
    rs.push(`    pub static FROM_RAW_LINE_DATA_${schemaName}: Lazy<HashMap<u32, super::FromRawFn>> = Lazy::new(|| {`);
    rs.push("        let mut m: HashMap<u32, super::FromRawFn> = HashMap::new();");
    for (const e of entities) {
        const key = crc(e.name.toUpperCase());
        const inits = e.derivedProps.map((p, j) => {
            return `${rsIdent(p.name)}: match ${fieldGetterExpr(j)} { Value::Null => None, v => Some(unsafe { std::mem::transmute(v) }) }`;
        }).join(", ");
        rs.push(`        m.insert(${key}, |v: Vec<Value>| -> super::AnyBox {`);
        rs.push(`            let obj = ${rsIdent(e.name)} { ${inits} };`);
        rs.push("            Box::new(obj)");
        rs.push("        });");
    }
    rs.push("        m");
    rs.push("    });");
    rs.push("");
}

// 역직렬화 매핑 (struct -> Vec<Value>)
export function emitToRaw(rs: string[], schemaName: string, entities: Entity[], crc: (s: string) => number) {
    rs.push(`    pub static TO_RAW_LINE_DATA_${schemaName}: Lazy<HashMap<u32, super::ToRawFn>> = Lazy::new(|| {`);
    rs.push("        let mut m: HashMap<u32, super::ToRawFn> = HashMap::new();");
    for (const e of entities) {
        const key = crc(e.name.toUpperCase());
        const lines: string[] = [];
        let idx = 0;
        for (const p of e.derivedProps) {
            lines.push(`            out.push(match &inst.${rsIdent(p.name)} { Some(_x) => Value::Null, None => Value::Null }); // TODO: map proper type`);
            idx++;
        }
        rs.push(`        m.insert(${key}, |any: &dyn Any| -> Vec<Value> {`);
        rs.push(`            let inst = any.downcast_ref::<${rsIdent(e.name)}>().expect("type mismatch in TO_RAW_LINE_DATA");`);
        rs.push("            let mut out: Vec<Value> = Vec::new();");
        rs.push(lines.join("\n"));
        rs.push("            out");
        rs.push("        });");
    }
    rs.push("        m");
    rs.push("    });");
    rs.push("");
}

export function emitConstructors(rs: string[], schemaName: string, entities: Entity[], crc: (s: string) => number) {
    // TS의 Constructors와 FromRaw가 동일한 역할 -> 여기선 동일 바인딩 유지
    rs.push(`    pub static CONSTRUCTORS_${schemaName}: Lazy<HashMap<u32, super::FromRawFn>> = Lazy::new(|| {`);
    rs.push("        let mut m: HashMap<u32, super::FromRawFn> = HashMap::new();");
    for (const e of entities) {
        const key = crc(e.name.toUpperCase());
        rs.push(`        m.insert(${key}, FROM_RAW_LINE_DATA_${schemaName}.get(&${key}).copied().unwrap());`);
    }
    rs.push("        m");
    rs.push("    });");
    rs.push("");
}

export function emitTypeInitialisers(rs: string[], schemaName: string, types: TypeDef[], crc: (s: string) => number) {
    rs.push(`    pub static TYPE_INITIALISERS_${schemaName}: Lazy<HashMap<u32, super::InitFn>> = Lazy::new(|| {`);
    rs.push("        let mut m: HashMap<u32, super::InitFn> = HashMap::new();");
    const done = new Set<string>();
    for (const t of types) {
        if (done.has(t.name)) continue;
        // 여기서는 단순 래퍼 초기화 스텁 (필요하면 세분화)
        const code = crc(t.name.toUpperCase());
        rs.push(`        m.insert(${code}, |v: Value| v );`);
        done.add(t.name);
    }
    rs.push("        m");
    rs.push("    });");
    rs.push("");
}
