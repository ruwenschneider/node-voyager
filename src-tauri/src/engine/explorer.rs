//! Address-space crawling helpers: map OPC UA browse results to serializable tree items.
use super::NodeItem;

pub fn class_label(class: &str) -> String {
    match class {
        "Object" | "Variable" | "Method" => class.to_string(),
        "ObjectType" | "VariableType" | "DataType" | "ReferenceType" | "View" => class.to_string(),
        _ => "Other".to_string(),
    }
}

/// Sort folders/objects before variables, then alphabetically.
pub fn sort_items(items: &mut [NodeItem]) {
    items.sort_by(|a, b| {
        let rank = |n: &NodeItem| if n.node_class == "Variable" { 1 } else { 0 };
        rank(a).cmp(&rank(b)).then_with(|| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()))
    });
}
