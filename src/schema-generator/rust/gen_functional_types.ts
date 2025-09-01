import { Entity } from "./gen_functional_types_interfaces";
import { sortEntities, parseElements, walkParents, findSubClasses, makeCRCTable, crc32, generateStructByMacro } from "./gen_functional_types_helpers"

import schemaAliases from "./schema_aliases";

const fs = require("fs");

let crcTable = makeCRCTable();

console.log("Starting...");

let rsSchema: Array<string> = [];

let completeifcElementList = new Set<string>();

let completeEntityList = new Set<string>();
completeEntityList.add("FILE_SCHEMA");
completeEntityList.add("FILE_NAME");
completeEntityList.add("FILE_DESCRIPTION");

let typeList = new Set<string>();

rsSchema.push(`use once_cell::sync::Lazy;`);
rsSchema.push(`use std::convert::Into;`);
rsSchema.push(`use std::collections::HashMap;`);
rsSchema.push(`use std::marker::PhantomData;`);

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
rsSchema.push(`pub struct IfcLineObject<'a> {`);
rsSchema.push(`    pub r#type: i32,`);
rsSchema.push(`    pub express_id: i32,`);
rsSchema.push(`    _phantom: PhantomData<&'a ()>`)
rsSchema.push(`}`);

rsSchema.push(``);
rsSchema.push(`impl<'a> IfcLineObject<'a> {`);
rsSchema.push(`    pub fn from(express_id: Option<i32>) -> Self {`);
rsSchema.push(`        Self {`);
rsSchema.push(`            r#type: 0,`);
rsSchema.push(`            express_id: express_id.unwrap_or(-1),`);
rsSchema.push(`            _phantom: PhantomData`)
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
rsSchema.push("");
rsSchema.push(`macro_rules! ifc_list_type {`);
rsSchema.push(`    ($name:ident, $inner:ty, $type_num:expr) => {`);
rsSchema.push(`        #[repr(C)]`);
rsSchema.push(`        #[derive(Debug, Clone)]`);
rsSchema.push(`        pub struct $name<'a> {`);
rsSchema.push(`            pub type_: u32,`);
rsSchema.push(`            pub value: Vec<$inner>,`);
rsSchema.push(`            _phantom: PhantomData<&'a ()>`)
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> $name<'a> {`);
rsSchema.push(`            pub fn from(value: Vec<$inner>) -> Self {`);
rsSchema.push(`                Self {`);
rsSchema.push(`                    type_: $type_num,`);
rsSchema.push(`                    value: value,`);
rsSchema.push(`                    _phantom: PhantomData`)
rsSchema.push(`                }`);
rsSchema.push("            }")
rsSchema.push("        }")
rsSchema.push("    };")
rsSchema.push(`}`);
rsSchema.push("");

rsSchema.push(`macro_rules! ifc_enum_type {`);
rsSchema.push(`    ($name:ident, { $($field:ident),* $(,)? }) => {`);
rsSchema.push(`        #[repr(C)]`);
rsSchema.push(`        #[derive(Debug, Clone)]`);
rsSchema.push(`        pub struct $name<'a> {`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $field: Arg,`);
rsSchema.push(`            )*`);
rsSchema.push(`            _phantom: PhantomData<&'a ()>`)
rsSchema.push(`        }`)
rsSchema.push(``);
rsSchema.push(`        impl<'a> $name<'a> {`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub const $field: Arg = Arg {`);
rsSchema.push(`                    type_: 3,`);
rsSchema.push(`                    value: stringify!($field),`);
rsSchema.push(`                };`);
rsSchema.push(`            )*`);
// rsSchema.push(`            _phantom: PhantomData`)
rsSchema.push(`        }`);
rsSchema.push(`    };`);
rsSchema.push(`}`);
rsSchema.push(``);

rsSchema.push(`macro_rules! ifc_value_type {`);
rsSchema.push(`    ($name:ident, $value_ty:ty, $type_num:expr) => {`);
rsSchema.push(`        #[repr(C)]`);
rsSchema.push(`        #[derive(Debug, Clone)]`);
rsSchema.push(`        pub struct $name<'a> {`);
rsSchema.push(`            pub type_: u32,`);
rsSchema.push(`            pub name: &'static str,`);
rsSchema.push(`            pub value: $value_ty,`);
rsSchema.push(`            _phantom: PhantomData<&'a ()>`)
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> $name<'a> {`);
rsSchema.push(`            pub fn from(v: $value_ty) -> Self {`);
rsSchema.push(`                Self {`);
rsSchema.push(`                    type_: $type_num,`);
rsSchema.push(`                    name: stringify!($name),`);
rsSchema.push(`                    value: v,`);
rsSchema.push(`                    _phantom: PhantomData`)
rsSchema.push(`                }`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`    };`);
rsSchema.push(`}`);
rsSchema.push(``);

rsSchema.push(`macro_rules! ifc_classes_type {`);
rsSchema.push(`    (`);
rsSchema.push(`        $name:ident <'a>,`);
rsSchema.push(`        $type_num:expr,`);
rsSchema.push(`        [$($inverse_field:ident : $inverse_field_ty: ty),* $(,)?],`);
rsSchema.push(`        [$($derive_field:ident : $derive_field_ty: ty),* $(,)?],`);
rsSchema.push(`        $is_ifc_root:expr,`);
rsSchema.push(`        $parent:ident <'a>,`);
// rsSchema.push(`        $parent_is_ifclineobj:expr,`);
rsSchema.push(`        [$($nonLocal_props:ident),* $(,)?],`);
rsSchema.push(`        $todo: expr`);
rsSchema.push(`    ) => {`);
rsSchema.push(`        #[repr(C)]`);
rsSchema.push(`        #[derive(Debug, Clone)]`);
rsSchema.push(`        pub struct $name<'a> {`);
rsSchema.push(`            type_: u32,`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $inverse_field: $inverse_field_ty,`);
rsSchema.push(`            )*`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $derive_field: $derive_field_ty,`);
rsSchema.push(`            )*`);
rsSchema.push(`            _phantom: PhantomData<&'a ()>`)
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> $name<'a> {`);
rsSchema.push(`            pub fn from($($derive_field: $derive_field_ty),*) -> Self {`);
rsSchema.push(`                $name {`);
rsSchema.push(`                    type_: $type_num,`);
rsSchema.push(`                    $(`);
rsSchema.push(`                        $inverse_field: None,`);
rsSchema.push(`                    )*`);
rsSchema.push(`                    $(`);
rsSchema.push(`                        $derive_field: $derive_field,`);
rsSchema.push(`                    )*`);
rsSchema.push(`                    _phantom: PhantomData`);
rsSchema.push(`                }`);
rsSchema.push(`            }`);
rsSchema.push(`            pub fn isifcroot() -> bool {`);
rsSchema.push(`                $is_ifc_root`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> Into<$parent<'a>> for $name<'a> {`);
rsSchema.push(`            fn into(self) -> $parent<'a> {`);
rsSchema.push(`                $parent::from($(self.$nonLocal_props,)*)`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`    };`)
rsSchema.push(`}`);
rsSchema.push("");

rsSchema.push(`macro_rules! ifc_classes_type_todo {`);
rsSchema.push(`    (`);
rsSchema.push(`        $name:ident <'a>,`);
rsSchema.push(`        $type_num:expr,`);
rsSchema.push(`        [$($inverse_field:ident : $inverse_field_ty: ty),* $(,)?],`);
rsSchema.push(`        [$($derive_field:ident : $derive_field_ty: ty),* $(,)?],`);
rsSchema.push(`        $is_ifc_root:expr,`);
rsSchema.push(`        $parent:ident <'a>,`);
rsSchema.push(`    ) => {`);
rsSchema.push(`        #[repr(C)]`);
rsSchema.push(`        #[derive(Debug, Clone)]`);
rsSchema.push(`        pub struct $name<'a> {`);
rsSchema.push(`            type_: u32,`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $inverse_field: $inverse_field_ty,`);
rsSchema.push(`            )*`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $derive_field: $derive_field_ty,`);
rsSchema.push(`            )*`);
rsSchema.push(`            _phantom: PhantomData<&'a ()>`)
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> $name<'a> {`);
rsSchema.push(`            pub fn from($($derive_field: $derive_field_ty),*) -> Self {`);
rsSchema.push(`                $name {`);
rsSchema.push(`                    type_: $type_num,`);
rsSchema.push(`                    $(`);
rsSchema.push(`                        $inverse_field: None,`);
rsSchema.push(`                    )*`);
rsSchema.push(`                    $(`);
rsSchema.push(`                        $derive_field: $derive_field,`);
rsSchema.push(`                    )*`);
rsSchema.push(`                    _phantom: PhantomData`);
rsSchema.push(`                }`);
rsSchema.push(`            }`);
rsSchema.push(`            pub fn isifcroot() -> bool {`);
rsSchema.push(`                $is_ifc_root`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> Into<$parent<'a>> for $name<'a> {`);
rsSchema.push(`            fn into(self) -> $parent<'a> {`);
rsSchema.push(`                todo!();`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`    };`)
rsSchema.push(`}`);
rsSchema.push("");

rsSchema.push(`macro_rules! ifc_classes_type_noparent {`);
rsSchema.push(`    (`);
rsSchema.push(`        $name:ident <'a>,`);
rsSchema.push(`        $type_num:expr,`);
rsSchema.push(`        [$($inverse_field:ident : $inverse_field_ty: ty),* $(,)?],`);
rsSchema.push(`        [$($derive_field:ident : $derive_field_ty: ty),* $(,)?],`);
rsSchema.push(`        $is_ifc_root:expr,`);
rsSchema.push(`    ) => {`);
rsSchema.push(`        #[repr(C)]`);
rsSchema.push(`        #[derive(Debug, Clone)]`);
rsSchema.push(`        pub struct $name<'a> {`);
rsSchema.push(`            type_: u32,`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $inverse_field: $inverse_field_ty,`);
rsSchema.push(`            )*`);
rsSchema.push(`            $(`);
rsSchema.push(`                pub $derive_field: $derive_field_ty,`);
rsSchema.push(`            )*`);
rsSchema.push(`            _phantom: PhantomData<&'a ()>`)
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> $name<'a> {`);
rsSchema.push(`            pub fn from($($derive_field: $derive_field_ty),*) -> Self {`);
rsSchema.push(`                $name {`);
rsSchema.push(`                    type_: $type_num,`);
rsSchema.push(`                    $(`);
rsSchema.push(`                        $inverse_field: None,`);
rsSchema.push(`                    )*`);
rsSchema.push(`                    $(`);
rsSchema.push(`                        $derive_field: $derive_field,`);
rsSchema.push(`                    )*`);
rsSchema.push(`                    _phantom: PhantomData`);
rsSchema.push(`                }`);
rsSchema.push(`            }`);
rsSchema.push(`            pub fn isifcroot() -> bool {`);
rsSchema.push(`                $is_ifc_root`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`        impl<'a> Into<IfcLineObject<'a>> for $name<'a> {`);
rsSchema.push(`            fn into(self) -> IfcLineObject<'a> {`);
rsSchema.push(`                IfcLineObject::from(None)`);
rsSchema.push(`            }`);
rsSchema.push(`        }`);
rsSchema.push(`    };`)
rsSchema.push(`}`);
rsSchema.push("");

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



    //generate Structs
    rsSchema.push(`pub mod ${schemaNameClean} {`);
    rsSchema.push(`    use super::*;\n`);

    types.forEach((type) => {
        if (type.isList) {
            let typeNum = type.typeNum;
            let typeName = type.typeName;
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
                valueType = `${typeName}<'a>`;
            }
            rsSchema.push(`    ifc_list_type!(${type.name}, ${valueType}, ${typeNum});`);

            typeList.add(type.name);
        } else if (type.isSelect) {
            rsSchema.push(`    #[repr(C)]`);
            rsSchema.push("    #[derive(Debug, Clone)]");
            rsSchema.push(`    pub enum ${type.name}<'a> {`);
            type.values.forEach(refType => {
                let isType: boolean = types.some(x => x.name == refType);

                if (isType) {
                    rsSchema.push(`        ${refType}(&'a ${refType}<'a>),`);
                } else {
                    rsSchema.push(`        ${refType}(Option<&'a ${refType}<'a>>),`);
                }
            });
            rsSchema.push("    }");
        } else if (type.isEnum) {
            rsSchema.push(`    ifc_enum_type!(${type.name}, ${type.values.reduce((prev, curr) => {
                return prev + `        ${curr},\n`;
            }, "{\n") + "    }"});`);
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
                valueType = `${typeName}<'a>`;
            }

            rsSchema.push(`    ifc_value_type!(${type.name}, ${valueType}, ${typeNum});`)
        }
    });

    for (var x = 0; x < entities.length; x++) generateStructByMacro(entities[x], rsSchema, types, crcTable);

    rsSchema.push("}");
}

new Set([...completeEntityList, ...typeList]).forEach(entity => {
    let name = entity.toUpperCase();
    let code = crc32(name, crcTable);
    rsSchema.unshift(`pub const ${name}: u32 = ${code};`)
});

// --------------------- Write to File ---------------------
fs.writeFileSync("ifc_schema.rs", rsSchema.join("\n"), "utf-8");

console.log("✅ ifc_schema.rs generated!");
