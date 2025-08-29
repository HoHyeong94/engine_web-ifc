import { Entity } from "./gen_functional_types_interfaces";
import { sortEntities, parseElements, walkParents, findSubClasses, generateStruct, makeCRCTable, crc32 } from "./gen_functional_types_helpers"

import schemaAliases from "./schema_aliases";

const fs = require("fs");

let crcTable = makeCRCTable();

console.log("Starting...");

let rsSchema: Array<string> = [];
let ifc23Schema: Array<string> = [];
let ifc4Schema: Array<string> = [];
let ifc43Schema: Array<string> = [];

let completeifcElementList = new Set<string>();

let completeEntityList = new Set<string>();
completeEntityList.add("FILE_SCHEMA");
completeEntityList.add("FILE_NAME");
completeEntityList.add("FILE_DESCRIPTION");

let typeList = new Set<string>();

rsSchema.push(`use once_cell::sync::Lazy;`);
rsSchema.push(`use std::convert::Into;`);
rsSchema.push(`use std::collections::HashMap;`);

rsSchema.push(`type InitFn = Box<dyn Fn(Value) -> Value + Send + Sync>;`);

rsSchema.push(``);
rsSchema.push(`/// --------------------- Value: 동적 값 표현 ---------------------`);
rsSchema.push(`#[repr(C)]`);
rsSchema.push(`#\[derive(Debug, Clone)\]`);
rsSchema.push(`pub enum Value {`);
rsSchema.push(`    Null,`);
rsSchema.push(`    Bool(bool),`);
rsSchema.push(`    U32(u32),`);
rsSchema.push(`    F64(f64),`);
rsSchema.push(`    I32(i32),`);
rsSchema.push(`    String(String),`);
rsSchema.push(`    Array(Vec<Value>),`);
rsSchema.push(`    Object(HashMap<u8, Value>),`);
rsSchema.push(`    Fn,`);
rsSchema.push(`    Labeled {`);
rsSchema.push(`        value: Box<Value>,`);
rsSchema.push(`        value_type: i32,`);
rsSchema.push(`        label: String,`);
rsSchema.push(`    },`);
// rsSchema.push(`    Handle(Handle),`);
// rsSchema.push(`    NumberHandle(Box<NumberHandle>),`);
rsSchema.push(`    TapeItem {`);
rsSchema.push(`        r#type: Option<i32>,`);
rsSchema.push(`        name: Option<String>,`);
rsSchema.push(`        internal_value: Option<Box<Value>>,`);
rsSchema.push(`        value: Option<Box<Value>>,`);
rsSchema.push(`        value_type: Option<i32>,`);
rsSchema.push(`        label: Option<String>,`);
rsSchema.push(`        typecode: Option<u32>,`);
rsSchema.push(`    },`);
rsSchema.push(`}`);
rsSchema.push(``);

rsSchema.push(``);
rsSchema.push(`impl Value {`);
rsSchema.push(`    pub fn is_labeled_type2(&self) -> bool {`);
rsSchema.push(`        matches!(self, Value::Labeled { value_type, .. } if *value_type == 2)`);
rsSchema.push(`    }`);
rsSchema.push(`    pub fn type_field(&self) -> Option<i32> {`);
rsSchema.push(`        match self {`);
rsSchema.push(`            Value::TapeItem { r#type, .. } => *r#type,`);
rsSchema.push(`            _ => None,`);
rsSchema.push(`        }`);
rsSchema.push(`    }`);
rsSchema.push(`}`);

rsSchema.push(``);
rsSchema.push(`#[repr(C)]`);
rsSchema.push(`#\[derive(Debug, Clone)\]`);
rsSchema.push(`pub struct Arg {`);
rsSchema.push(`    pub type_: u32,`);
rsSchema.push(`    pub value: &'static str`);
rsSchema.push(`}`);
rsSchema.push(``);

rsSchema.push(`#[repr(C)]`);
rsSchema.push(`#\[derive(Debug, Clone)\]`);
rsSchema.push(`pub enum IfcTokenType {`);
rsSchema.push(`    UNKNOWN,`);
rsSchema.push(`    STRING,`);
rsSchema.push(`    LABEL,`);
rsSchema.push(`    ENUM,`);
rsSchema.push(`    REAL,`);
rsSchema.push(`    REF,`);
rsSchema.push(`    EMPTY,`);
rsSchema.push(`    SET_BEGIN,`);
rsSchema.push(`    SET_END,`);
rsSchema.push(`    LINE_END,`);
rsSchema.push(`    INTEGER,`);
rsSchema.push(`}`);

// rsSchema.push(`/// --------------------- Handle (TS class Handle< _ >) ---------------------`);
// rsSchema.push(`#\[derive(Debug, Clone)\]`);
// rsSchema.push(`pub struct Handle {`);
// rsSchema.push(`    pub r#type: u32, // 항상 5`);
// rsSchema.push(`    pub value: Option<u32>,`);
// rsSchema.push(`}`);

// rsSchema.push(``);
// rsSchema.push(`/// TS의 "생성자에서 다른 걸 return" 특성 대응`);
// rsSchema.push(`#\[derive(Debug, Clone)\]`);
// rsSchema.push(`pub enum InitResult {`);
// rsSchema.push(`    Handle(Handle),`);
// rsSchema.push(`    Value(Value),`);
// rsSchema.push(`}`);

// rsSchema.push(``);
// rsSchema.push(`impl Handle {`);
// rsSchema.push(`    pub fn new(value: Option<u32>, schema: u32, tape_item: Option<&mut Value>) -> InitResult {`);
// rsSchema.push(`        if let Some(ti) = tape_item {`);
// rsSchema.push(`            if ti.type_field() == Some(2) {`);
// rsSchema.push(`                let v = type_initialiser(schema, ti);`);
// rsSchema.push(`                return InitResult::Value(v);`);
// rsSchema.push(`            }`);
// rsSchema.push(`        }`);
// rsSchema.push(``);
// rsSchema.push(`        InitResult::Handle(Handle {`);
// rsSchema.push(`            r#type: 5,`);
// rsSchema.push(`            value: value,`);
// rsSchema.push(`        })`);
// rsSchema.push(`    }`);
// rsSchema.push(`}`);

// rsSchema.push(``);
// rsSchema.push(`/// --------------------- NumberHandle (TS class NumberHandle) ---------------------`);
// rsSchema.push(`#\[derive(Debug, Clone)\]`);
// rsSchema.push(`pub struct NumberHandle {`);
// rsSchema.push(`    pub type_: u32,`);
// rsSchema.push(`    internal_value: Option<f64>,`);
// rsSchema.push(`    representation_value: Option<f64>,`);
// rsSchema.push(`}`);

// rsSchema.push(``);
// rsSchema.push(`impl NumberHandle {`);
// rsSchema.push(`    pub fn new(v: Option<f64>, type_: Option<u32>) -> Self {`);
// rsSchema.push(`        let mut s = NumberHandle {`);
// rsSchema.push(`            type_: type_.unwrap_or(4),`);
// rsSchema.push(`            internal_value: None,`);
// rsSchema.push(`            representation_value: None,`);
// rsSchema.push(`        };`);
// rsSchema.push(`        s.set_value(v);`);
// rsSchema.push(`        s`);
// rsSchema.push(`    }`);
// rsSchema.push(``);
// rsSchema.push(`    pub fn internal_value(&self) -> Option<f64> {`);
// rsSchema.push(`        self.internal_value`);
// rsSchema.push(`    }`);
// rsSchema.push(``);
// rsSchema.push(`    pub fn value(&self) -> Option<f64> {`);
// rsSchema.push(`        self.representation_value`);
// rsSchema.push(`    }`);
// rsSchema.push(``);
// rsSchema.push(`    pub fn set_value(&mut self, v: Option<f64>) {`);
// rsSchema.push(`        self.internal_value = v;`);
// rsSchema.push(`        self.representation_value = v;`);
// rsSchema.push(`    }`);
// rsSchema.push(`}`);

rsSchema.push(``);
rsSchema.push(`/// --------------------- logical (TS enum logical) ---------------------`);
rsSchema.push(`#[repr(C)]`);
rsSchema.push(`#\[derive(Debug, Clone, Copy, PartialEq, Eq)\]`);
rsSchema.push(`pub enum Logical {`);
rsSchema.push(`    FALSE,`);
rsSchema.push(`    TRUE,`);
rsSchema.push(`    UNKNOWN,`);
rsSchema.push(`}`);

rsSchema.push(``);
rsSchema.push(`/// --------------------- IfcLineObject (TS abstract class) ---------------------`);
rsSchema.push(`#[repr(C)]`);
rsSchema.push(`#\[derive(Debug, Clone)\]`);
rsSchema.push(`pub struct IfcLineObject {`);
rsSchema.push(`    pub r#type: i32,`);
rsSchema.push(`    pub express_id: i32,`);
rsSchema.push(`}`);

rsSchema.push(``);
rsSchema.push(`impl IfcLineObject {`);
rsSchema.push(`    pub fn from(express_id: Option<i32>) -> Self {`);
rsSchema.push(`        Self {`);
rsSchema.push(`            r#type: 0,`);
rsSchema.push(`            express_id: express_id.unwrap_or(-1),`);
rsSchema.push(`        }`);
rsSchema.push(`    }`);
rsSchema.push(`}`);

// rsSchema.push(``);
// rsSchema.push(`pub fn type_initialiser(schema: u32, tape_item: &mut Value) -> Value {`);
// rsSchema.push(`    match tape_item {`);
// rsSchema.push(`        Value::Array(items) => {`);
// rsSchema.push(`            for item in items.iter_mut() {`);
// rsSchema.push(`                let a = type_initialiser(schema, item);`);
// rsSchema.push(`                *item = a;`);
// rsSchema.push(`            }`);
// rsSchema.push(`            Value::Null`);
// rsSchema.push(`        }`);
// rsSchema.push(`        Value::TapeItem { typecode, value, .. } => {`);
// rsSchema.push(`            if let Some(tc) = typecode {`);
// rsSchema.push(`                if let Some(val) = value {`);
// rsSchema.push(`                    if let Some(map) = TYPE_INITIALISERS.get(&schema) {`);
// rsSchema.push(`                        if let Some(func) = map.get(&tc) {`);
// rsSchema.push(`                            return func((*val).clone());`);
// rsSchema.push(`                        }`);
// rsSchema.push(`                    }`);
// rsSchema.push(`                }`);
// rsSchema.push(`            } else if let Some(val) = value {`);
// rsSchema.push(`                return (*val).clone();`);
// rsSchema.push(`            }`);
// rsSchema.push(`            Value::Null`);
// rsSchema.push(`        }`);
// rsSchema.push(`        Value::NumberHandle(nh) => {`);
// rsSchema.push(`            if let Some(value) = nh.value() {`);
// rsSchema.push(`                return Value::F64(value);`);
// rsSchema.push(`            }`);
// rsSchema.push(`            Value::Null`);
// rsSchema.push(`        }`);
// rsSchema.push(`        Value::Handle(h) => {`);
// rsSchema.push(`            if let Some(value) = h.value {`);
// rsSchema.push(`                return Value::Number(value);`);
// rsSchema.push(`            }`);
// rsSchema.push(`            Value::Null`);
// rsSchema.push(`        }`);
// rsSchema.push(`        _ => Value::Null,`);
// rsSchema.push(`    }`);
// rsSchema.push(`}`);

// rsSchema.push(``);
// rsSchema.push(`pub fn labelise(tape_item: &mut Value) -> Value {`);
// rsSchema.push(`    match tape_item {`);
// rsSchema.push(`        Value::Array(items) => {`);
// rsSchema.push(`            for item in items.iter_mut() {`);
// rsSchema.push(`                let a = labelise(item);`);
// rsSchema.push(`                *item = a;`);
// rsSchema.push(`            }`);
// rsSchema.push(`            Value::Null`);
// rsSchema.push(`        }`);
// rsSchema.push(`        Value::TapeItem { r#type, name, internal_value, value, value_type, label, typecode } => {`);
// rsSchema.push(`            if let Some(lab) = label {`);
// rsSchema.push(`                return tape_item.clone();`);
// rsSchema.push(`            }`);
// rsSchema.push(`            if let Some(type_id) = r#type {`);
// rsSchema.push(`                if *type_id == 4 {`);
// rsSchema.push(`                    return Value::TapeItem {`);
// rsSchema.push(`                        r#type: Some(2),`);
// rsSchema.push(`                        internal_value: internal_value.take(),`);
// rsSchema.push(`                        value_type: Some(*type_id),`);
// rsSchema.push(`                        label: name.take(),`);
// rsSchema.push(`                        typecode: None,`);
// rsSchema.push(`                        value: None,`);
// rsSchema.push(`                        name: None,`);
// rsSchema.push(`                    };`);
// rsSchema.push(`                }`);
// rsSchema.push(`                return Value::TapeItem {`);
// rsSchema.push(`                    r#type: Some(2),`);
// rsSchema.push(`                    internal_value: None,`);
// rsSchema.push(`                    value_type: Some(*type_id),`);
// rsSchema.push(`                    label: name.take(),`);
// rsSchema.push(`                    typecode: None,`);
// rsSchema.push(`                    value: value.take(),`);
// rsSchema.push(`                    name: None,`);
// rsSchema.push(`                };`);
// rsSchema.push(`            }`);
// rsSchema.push(`            Value::Null`);
// rsSchema.push(`        }`);
// rsSchema.push(`        _ => tape_item.clone(),`);
// rsSchema.push(`    }`);
// rsSchema.push(`}`);

var files = fs.readdirSync("./");
rsSchema.push(``);
rsSchema.push(`/// --------------------- Schemas (TS enum Schemas) ---------------------`);
rsSchema.push(`#[repr(C)]`);
rsSchema.push(`#\[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)\]`);
rsSchema.push(`pub enum Schemas {`);
for (var i = 0; i < files.length; i++) {
    if (!files[i].endsWith(".exp")) continue;
    const schemaName = files[i].replace(".exp", "");
    rsSchema.push(`\t${schemaName.replace(".", "_")},`);
}
rsSchema.push(`}`);
// let first: boolean = true;
for (var i = 0; i < files.length; i++) {
    if (!files[i].endsWith(".exp")) continue;
    var schemaName = files[i].replace(".exp", "");
    var schemaNameClean = schemaName.replace(".", "_");
    console.log("Generating Schema for:" + schemaName);
    let schemaAssignments: string = `static SCHEMA_NAMES_${i}: Lazy<HashMap<u32, Vec<&str>>> = Lazy::new(|| {\n`;
    schemaAssignments += `    let mut m = HashMap::new();\n`;
    schemaAssignments += `    let mut v = vec!["${schemaNameClean}"];\n`;
    for (const schemaAlias of schemaAliases) {
        if (schemaAlias.alias == schemaNameClean) {
            schemaAssignments += `    v.push("${schemaAlias.schemaName}");\n`;
        };
    }
    schemaAssignments += `    m.insert(${i}, v); \n`;
    schemaAssignments += `    m\n`
    schemaAssignments += `});`
    rsSchema.push(schemaAssignments);

    let schemaData = fs.readFileSync("./" + files[i]).toString();
    let parsed = parseElements(schemaData);
    let entities: Array<Entity> = sortEntities(parsed.entities);
    let types = parsed.types;

    entities.forEach((e) => {
        walkParents(e, entities);
    });

    entities = findSubClasses(entities);

    for (var x = 0; x < entities.length; x++) {
        completeEntityList.add(entities[x].name);
        if (entities[x].isIfcProduct) completeifcElementList.add(entities[x].name);
    }

    //generate FromRawLineData
    // rsSchema.push(`static FROM_RAW_LINE_DATA_${i}: HashMap<u32, Box<dyn Fn(Value) -> Value + Send + Sync>> = Lazy::new(|| {`);
    // rsSchema.push(`    let mut m = HashMap::new();`);
    // rsSchema.push(`    `)
    // for (var x=0; x < entities.length; x++) {
    //     let constructorArray = entities[x].derivedProps.filter(j => !entities[x].ifcDerivedProps.includes(j.name));
    //     rsSchema.push(`    m.insert(${crc32(entities[x].name.toUpperCase(), crcTable)},  )`);
    // }

    let ifcModuleSchema: Array<string> = [];

    //generate Structs
    ifcModuleSchema.push(`pub mod ${schemaNameClean} {`);
    // rsSchema.push(`    use super::*;\n`);
    ifcModuleSchema.push(`    use crate::api::schema::ifc_schema;`)

    types.forEach((type) => {
        if (type.isList) {
            let typeNum = type.typeNum;
            ifcModuleSchema.push(`    #[repr(C)]`);
            ifcModuleSchema.push("    #[derive(Debug, Clone)]");
            ifcModuleSchema.push(`    pub struct ${type.name} { `);
            ifcModuleSchema.push(`        pub type_: u32,`);
            ifcModuleSchema.push(`        pub value: Vec<${type.typeName === "number" ? "f64" : type.typeName}>, `);
            ifcModuleSchema.push("    }");

            ifcModuleSchema.push(`    impl ${type.name} {`);
            ifcModuleSchema.push(`        pub fn from(value: Vec<${type.typeName === "number" ? "f64" : type.typeName}>) -> Self {`);
            ifcModuleSchema.push("            Self {");
            ifcModuleSchema.push(`                type_: ${typeNum}, `);
            ifcModuleSchema.push(`                value,`);
            ifcModuleSchema.push("            }")
            ifcModuleSchema.push("        }")
            ifcModuleSchema.push("    }")

            typeList.add(type.name);
        } else if (type.isSelect) {
            ifcModuleSchema.push(`    #[repr(C)]`);
            ifcModuleSchema.push("    #[derive(Debug, Clone)]");
            ifcModuleSchema.push(`    pub enum ${type.name}<'a> {`);
            // let first = true;
            type.values.forEach(refType => {
                let isType: boolean = types.some(x => x.name == refType);
                
                if (isType) {
                    ifcModuleSchema.push(`        ${refType}(&'a ${refType}<'a>),`);
                } else {
                    ifcModuleSchema.push(`        ${refType}(Option<&'a ${refType}<'a>>),`);
                }
            });
            ifcModuleSchema.push("    }");
        } else if (type.isEnum) {
            ifcModuleSchema.push(`    #[repr(C)]`);
            ifcModuleSchema.push("    #[derive(Debug, Clone)]");
            ifcModuleSchema.push(`    pub struct ${type.name} {`);
            type.values.map((v) => {
                ifcModuleSchema.push(`        pub ${v}: Arg, `);
            });
            ifcModuleSchema.push(`    }`);

            ifcModuleSchema.push(`    impl ${type.name} {`);

            type.values.map((v) => {
                ifcModuleSchema.push(`        pub const ${v}: Arg = Arg {`);
                ifcModuleSchema.push(`            type_: 3,`);
                ifcModuleSchema.push(`            value: "${v}"`)
                ifcModuleSchema.push(`        };`);
            })
            ifcModuleSchema.push(`    }`);
        }
        else {
            let typeName = type.typeName;
            let typeNum = type.typeNum;
            if (type.typeName.search('Ifc') != -1) {
                let rawType = types.find(x => x.name == type.typeName);
                typeName = rawType!.typeName;
                typeNum = rawType!.typeNum;
            }
            typeList.add(type.name);
            
            ifcModuleSchema.push(`    #[repr(C)]`);
            ifcModuleSchema.push("    #[derive(Debug, Clone)]");
            ifcModuleSchema.push(`    pub struct ${type.name} {`);
            ifcModuleSchema.push(`        pub type_: u32,`);
            ifcModuleSchema.push(`        pub name: &'static str,`);

            let valueType: string;
            if (typeName == "boolean") {
                valueType = "bool";
            } else if (typeName == "logical") {
                valueType = "Logical";
            } else if (typeName == "number") {
                valueType = "f64";
            } else if (typeName == "string") {
                valueType = "String"
            } else {
                valueType = typeName;
            }
            ifcModuleSchema.push(`        pub value: ${valueType},`);
            ifcModuleSchema.push(`    }`);

            ifcModuleSchema.push(`    impl ${type.name} {`);
            ifcModuleSchema.push(`        fn from(v: ${valueType}) -> Self {`);
            ifcModuleSchema.push(`            Self {`);
            ifcModuleSchema.push(`                type_: ${typeNum},`);
            ifcModuleSchema.push(`                name: "${type.name.toUpperCase()}",`);
            ifcModuleSchema.push(`                value: v`);
            ifcModuleSchema.push(`            }`);
            ifcModuleSchema.push(`        }`);
            ifcModuleSchema.push(`    }`);
            ifcModuleSchema.push(``);
        }
    });

    for (var x = 0; x < entities.length; x++) generateStruct(entities[x], ifcModuleSchema,types,crcTable);
    
    ifcModuleSchema.push("}"); 

    if (schemaNameClean === "IFC2X3") {
        ifc23Schema = ifcModuleSchema;
    } else if (schemaNameClean === "IFC4") {
        ifc4Schema = ifcModuleSchema;
    } else if (schemaNameClean === "IFC4X3") {
        ifc43Schema = ifcModuleSchema;
    }
}

new Set([...completeEntityList,...typeList]).forEach(entity => {
    let name = entity.toUpperCase();
    let code = crc32(name,crcTable);
    rsSchema.unshift(`pub const ${name}: u32 = ${code};`)
});

// --------------------- Write to File ---------------------
fs.writeFileSync("ifc_schema.rs", rsSchema.join("\n"), "utf-8");
fs.writeFileSync("ifc_schema_2x3.rs", ifc23Schema.join("\n"), "utf-8");
fs.writeFileSync("ifc_schema_4.rs", ifc4Schema.join("\n"), "utf-8");
fs.writeFileSync("ifc_schema_4x3.rs", ifc43Schema.join("\n"), "utf-8");

console.log("✅ ifc_schema.rs generated!");
